import { z } from 'zod'

import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from './limits'
import { isSupportedPatchPath, parsePatchPathValue } from './paths'
import type { ApplyPatchCommand, PatchState } from './types'

const unitInterval = z.number().finite().min(0).max(1)
const seconds = (maximum: number) => z.number().finite().min(0).max(maximum)

export const patchMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z
      .enum(['pad', 'bass', 'lead', 'pluck', 'keys', 'atmosphere', 'rhythmic', 'other'])
      .optional(),
    description: z.string().trim().min(1).max(500).optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(12),
  })
  .strict()

export const oscillatorStateSchema = z
  .object({
    enabled: z.boolean(),
    wavetableId: z.string().trim().min(1).max(64),
    wavetablePosition: unitInterval,
    level: unitInterval,
    transposeSemitones: z.number().int().min(-24).max(24),
    fineTuneCents: z.number().finite().min(-100).max(100),
    unisonVoices: z.number().int().min(1).max(8),
    unisonDetune: unitInterval,
    stereoSpread: unitInterval,
    randomPhase: unitInterval,
  })
  .strict()

export const envelopeStateSchema = z
  .object({
    attackSeconds: seconds(10),
    holdSeconds: seconds(5),
    decaySeconds: seconds(10),
    sustainLevel: unitInterval,
    releaseSeconds: seconds(20),
  })
  .strict()

export const filterStateSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(['lowpass', 'highpass', 'bandpass', 'notch']),
    cutoffHz: z
      .number()
      .int()
      .finite()
      .min(FILTER_CUTOFF_MIN_HZ)
      .max(FILTER_CUTOFF_MAX_HZ),
    resonance: unitInterval,
  })
  .strict()

export const lfoPointSchema = z
  .object({
    x: unitInterval,
    y: unitInterval,
    power: z.number().finite().min(-1).max(1).optional(),
  })
  .strict()

export const lfoRateSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('sync'),
      division: z.enum(['1/1', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T']),
    })
    .strict(),
  z.object({ mode: z.literal('free'), hz: z.number().finite().min(0.01).max(40) }).strict(),
])

export const lfoStateSchema = z
  .object({
    points: z.array(lfoPointSchema).min(2).max(32),
    rate: lfoRateSchema,
    phase: unitInterval,
    smooth: z.boolean(),
  })
  .strict()
  .superRefine((lfo, context) => {
    for (let index = 1; index < lfo.points.length; index += 1) {
      if (lfo.points[index].x < lfo.points[index - 1].x) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LFO points must be sorted by x',
          path: ['points', index, 'x'],
        })
      }
    }
  })

export const modulationRouteSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    source: z.enum(['lfo1', 'modEnvelope']),
    destination: z.enum([
      'oscillator1.level',
      'oscillator1.wavetablePosition',
      'oscillator1.pitch',
      'oscillator2.level',
      'oscillator2.wavetablePosition',
      'oscillator2.pitch',
      'filter.cutoff',
    ]),
    amount: z.number().finite().min(-1).max(1),
    bipolar: z.boolean(),
  })
  .strict()

export const voiceStateSchema = z
  .object({
    polyphony: z.number().int().min(1).max(16),
    legato: z.boolean(),
    glideSeconds: seconds(5),
    velocitySensitivity: unitInterval,
  })
  .strict()

export const delayStateSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['sync', 'free']),
    division: z.enum(['1/4', '1/8', '1/8T', '1/16']).optional(),
    timeSeconds: seconds(4).optional(),
    feedback: unitInterval,
    mix: unitInterval,
  })
  .strict()
  .superRefine((delay, context) => {
    if (delay.mode === 'sync' && delay.division === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Synchronized delay requires a division',
        path: ['division'],
      })
    }
    if (delay.mode === 'free' && delay.timeSeconds === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Free delay requires timeSeconds',
        path: ['timeSeconds'],
      })
    }
  })

export const reverbStateSchema = z
  .object({
    enabled: z.boolean(),
    mix: unitInterval,
    decaySeconds: seconds(20),
    size: unitInterval,
  })
  .strict()

export const wavetableFrameStateSchema = z
  .object({
    harmonics: z.array(unitInterval).min(1).max(128),
  })
  .strict()

export const wavetableStateSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    frames: z.array(wavetableFrameStateSchema).min(1).max(64),
  })
  .strict()

export const patchStateSchema = z
  .object({
    version: z.literal(1),
    metadata: patchMetadataSchema,
    oscillators: z.tuple([oscillatorStateSchema, oscillatorStateSchema]),
    ampEnvelope: envelopeStateSchema,
    modEnvelope: envelopeStateSchema,
    filter: filterStateSchema,
    lfo1: lfoStateSchema,
    modulations: z.array(modulationRouteSchema).max(16),
    voice: voiceStateSchema,
    effects: z.object({ delay: delayStateSchema, reverb: reverbStateSchema }).strict(),
    wavetableData: z.record(wavetableStateSchema),
  })
  .strict()
  .superRefine((patch, context) => {
    for (const [id, wavetable] of Object.entries(patch.wavetableData)) {
      if (wavetable.id !== id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Wavetable key ${id} does not match its id`,
          path: ['wavetableData', id, 'id'],
        })
      }
    }

    patch.oscillators.forEach((oscillator, index) => {
      if (!(oscillator.wavetableId in patch.wavetableData)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown wavetable id: ${oscillator.wavetableId}`,
          path: ['oscillators', index, 'wavetableId'],
        })
      }
    })

    const routeIds = new Set<string>()
    patch.modulations.forEach((route, index) => {
      if (routeIds.has(route.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate modulation route id: ${route.id}`,
          path: ['modulations', index, 'id'],
        })
      }
      routeIds.add(route.id)
    })
  })

const rawApplyPatchCommandSchema = z
  .object({
    type: z.literal('apply_patch'),
    reason: z.string().trim().min(1).max(500),
    changes: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()

export function parsePatchState(value: unknown): PatchState {
  return patchStateSchema.parse(value) as PatchState
}

export function parseApplyPatchCommand(value: unknown): ApplyPatchCommand {
  const command = rawApplyPatchCommandSchema.parse(value)
  const seenPaths = new Set<string>()

  for (const [index, change] of command.changes.entries()) {
    if (!isSupportedPatchPath(change.path)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Unsupported patch path: ${change.path}`,
          path: ['changes', index, 'path'],
        },
      ])
    }
    if (seenPaths.has(change.path)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Duplicate patch path: ${change.path}`,
          path: ['changes', index, 'path'],
        },
      ])
    }
    try {
      parsePatchPathValue(change.path, change.value)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new z.ZodError(
          error.issues.map((issue) => ({
            ...issue,
            path: ['changes', index, 'value', ...issue.path],
          })),
        )
      }
      throw error
    }
    seenPaths.add(change.path)
  }

  return command as ApplyPatchCommand
}
