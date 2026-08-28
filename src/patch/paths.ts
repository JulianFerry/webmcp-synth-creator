import { z, type ZodTypeAny } from 'zod'

import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from './limits'
import type { PatchState } from './types'

export const SUPPORTED_PATCH_PATHS = [
  'metadata.name',
  'metadata.category',
  'metadata.description',
  'metadata.tags',
  'oscillators.0.enabled',
  'oscillators.0.wavetableId',
  'oscillators.0.wavetablePosition',
  'oscillators.0.level',
  'oscillators.0.transposeSemitones',
  'oscillators.0.fineTuneCents',
  'oscillators.0.unisonVoices',
  'oscillators.0.unisonDetune',
  'oscillators.0.stereoSpread',
  'oscillators.0.randomPhase',
  'oscillators.1.enabled',
  'oscillators.1.wavetableId',
  'oscillators.1.wavetablePosition',
  'oscillators.1.level',
  'oscillators.1.transposeSemitones',
  'oscillators.1.fineTuneCents',
  'oscillators.1.unisonVoices',
  'oscillators.1.unisonDetune',
  'oscillators.1.stereoSpread',
  'oscillators.1.randomPhase',
  'ampEnvelope.attackSeconds',
  'ampEnvelope.holdSeconds',
  'ampEnvelope.decaySeconds',
  'ampEnvelope.sustainLevel',
  'ampEnvelope.releaseSeconds',
  'modEnvelope.attackSeconds',
  'modEnvelope.holdSeconds',
  'modEnvelope.decaySeconds',
  'modEnvelope.sustainLevel',
  'modEnvelope.releaseSeconds',
  'filter.enabled',
  'filter.type',
  'filter.cutoffHz',
  'filter.resonance',
  'lfo1.points',
  'lfo1.rate',
  'lfo1.phase',
  'lfo1.smooth',
  'modulations',
  'voice.polyphony',
  'voice.legato',
  'voice.glideSeconds',
  'voice.velocitySensitivity',
  'effects.delay.enabled',
  'effects.delay.mode',
  'effects.delay.division',
  'effects.delay.timeSeconds',
  'effects.delay.feedback',
  'effects.delay.mix',
  'effects.reverb.enabled',
  'effects.reverb.mix',
  'effects.reverb.decaySeconds',
  'effects.reverb.size',
] as const

export type SupportedPatchPath = (typeof SUPPORTED_PATCH_PATHS)[number]

const unitInterval = z.number().finite().min(0).max(1)
const seconds = (maximum: number) => z.number().finite().min(0).max(maximum)
const patchCategory = z.enum([
  'pad',
  'bass',
  'lead',
  'pluck',
  'keys',
  'atmosphere',
  'rhythmic',
  'other',
])
const lfoPoint = z
  .object({
    x: unitInterval,
    y: unitInterval,
    power: z.number().finite().min(-1).max(1).optional(),
  })
  .strict()
const lfoRate = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('sync'),
      division: z.enum(['1/1', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T']),
    })
    .strict(),
  z.object({ mode: z.literal('free'), hz: z.number().finite().min(0.01).max(40) }).strict(),
])
const modulationRoute = z
  .object({
    id: z.string().min(1).max(64),
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

const pathValueSchemas: Record<SupportedPatchPath, ZodTypeAny> = {
  'metadata.name': z.string().trim().min(1).max(80),
  'metadata.category': patchCategory,
  'metadata.description': z.string().trim().min(1).max(500),
  'metadata.tags': z.array(z.string().trim().min(1).max(32)).max(12),
  'oscillators.0.enabled': z.boolean(),
  'oscillators.0.wavetableId': z.string().trim().min(1).max(64),
  'oscillators.0.wavetablePosition': unitInterval,
  'oscillators.0.level': unitInterval,
  'oscillators.0.transposeSemitones': z.number().int().min(-24).max(24),
  'oscillators.0.fineTuneCents': z.number().finite().min(-100).max(100),
  'oscillators.0.unisonVoices': z.number().int().min(1).max(8),
  'oscillators.0.unisonDetune': unitInterval,
  'oscillators.0.stereoSpread': unitInterval,
  'oscillators.0.randomPhase': unitInterval,
  'oscillators.1.enabled': z.boolean(),
  'oscillators.1.wavetableId': z.string().trim().min(1).max(64),
  'oscillators.1.wavetablePosition': unitInterval,
  'oscillators.1.level': unitInterval,
  'oscillators.1.transposeSemitones': z.number().int().min(-24).max(24),
  'oscillators.1.fineTuneCents': z.number().finite().min(-100).max(100),
  'oscillators.1.unisonVoices': z.number().int().min(1).max(8),
  'oscillators.1.unisonDetune': unitInterval,
  'oscillators.1.stereoSpread': unitInterval,
  'oscillators.1.randomPhase': unitInterval,
  'ampEnvelope.attackSeconds': seconds(10),
  'ampEnvelope.holdSeconds': seconds(5),
  'ampEnvelope.decaySeconds': seconds(10),
  'ampEnvelope.sustainLevel': unitInterval,
  'ampEnvelope.releaseSeconds': seconds(20),
  'modEnvelope.attackSeconds': seconds(10),
  'modEnvelope.holdSeconds': seconds(5),
  'modEnvelope.decaySeconds': seconds(10),
  'modEnvelope.sustainLevel': unitInterval,
  'modEnvelope.releaseSeconds': seconds(20),
  'filter.enabled': z.boolean(),
  'filter.type': z.enum(['lowpass', 'highpass', 'bandpass', 'notch']),
  'filter.cutoffHz': z
    .number()
    .int()
    .finite()
    .min(FILTER_CUTOFF_MIN_HZ)
    .max(FILTER_CUTOFF_MAX_HZ),
  'filter.resonance': unitInterval,
  'lfo1.points': z.array(lfoPoint).min(2).max(32),
  'lfo1.rate': lfoRate,
  'lfo1.phase': unitInterval,
  'lfo1.smooth': z.boolean(),
  modulations: z.array(modulationRoute).max(16),
  'voice.polyphony': z.number().int().min(1).max(16),
  'voice.legato': z.boolean(),
  'voice.glideSeconds': seconds(5),
  'voice.velocitySensitivity': unitInterval,
  'effects.delay.enabled': z.boolean(),
  'effects.delay.mode': z.enum(['sync', 'free']),
  'effects.delay.division': z.enum(['1/4', '1/8', '1/8T', '1/16']),
  'effects.delay.timeSeconds': seconds(4),
  'effects.delay.feedback': unitInterval,
  'effects.delay.mix': unitInterval,
  'effects.reverb.enabled': z.boolean(),
  'effects.reverb.mix': unitInterval,
  'effects.reverb.decaySeconds': seconds(20),
  'effects.reverb.size': unitInterval,
}

const supportedPathSet = new Set<string>(SUPPORTED_PATCH_PATHS)

export function isSupportedPatchPath(path: string): path is SupportedPatchPath {
  return supportedPathSet.has(path)
}

export function parsePatchPathValue(path: SupportedPatchPath, value: unknown): unknown {
  return pathValueSchemas[path].parse(value)
}

export function getPatchPathValue(patch: PatchState, path: SupportedPatchPath): unknown {
  let cursor: unknown = patch
  for (const segment of path.split('.')) {
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

export function setPatchPathValue(
  patch: PatchState,
  path: SupportedPatchPath,
  value: unknown,
): void {
  const segments = path.split('.')
  let cursor = patch as unknown as Record<string, unknown>
  for (const segment of segments.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[segments.at(-1) as string] = value
}
