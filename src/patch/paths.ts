import { z, type ZodTypeAny } from 'zod'

import {
  DELAY_TIME_MAX_SECONDS,
  DELAY_TIME_MIN_SECONDS,
  ENVELOPE_DELAY_MAX_SECONDS,
  ENVELOPE_HOLD_MAX_SECONDS,
  FILTER_CUTOFF_MAX_HZ,
  FILTER_CUTOFF_MIN_HZ,
  REVERB_DECAY_MAX_SECONDS,
  REVERB_DECAY_MIN_SECONDS,
  REVERB_PREDELAY_MAX_SECONDS,
  TEMPO_SYNC_DIVISIONS,
} from './limits'
import { EFFECT_IDS } from './effects'
import type { PatchState } from './types'

export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'] as const
export const FILTER_SLOPES = [12, 24] as const
export const DISTORTION_TYPES = ['soft_clip', 'hard_clip', 'sine_fold', 'bit_crush'] as const
export const COMPRESSOR_BANDS = ['multiband', 'low', 'high'] as const
export const LFO_TARGETS = ['level', 'position', 'pitch', 'cutoff'] as const
export const LFO_SCOPES = ['all', 1, 2, 3] as const

const unitInterval = z.number().finite().min(0).max(1)
const seconds = (maximum: number) => z.number().finite().min(0).max(maximum)
const secondsRange = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum)
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
      division: z.enum(TEMPO_SYNC_DIVISIONS),
    })
    .strict(),
  z.object({ mode: z.literal('free'), hz: z.number().finite().min(0.01).max(40) }).strict(),
])
const lfoPoints = z
  .array(lfoPoint)
  .min(2)
  .max(32)
  .superRefine((points, context) => {
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].x < points[index - 1].x) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LFO points must be sorted by x',
          path: [index, 'x'],
        })
      }
    }
  })
export interface PatchPathMetadata {
  validator: ZodTypeAny
  unit: string
}

const metadata = (validator: ZodTypeAny, unit: string): PatchPathMetadata => ({ validator, unit })

export const PATCH_PATH_REGISTRY = {
  'metadata.name': metadata(z.string().trim().min(1).max(80), 'string'),
  'metadata.category': metadata(patchCategory, 'enum'),
  'metadata.description': metadata(z.string().trim().min(1).max(500), 'string'),
  'metadata.tags': metadata(z.array(z.string().trim().min(1).max(32)).max(12), 'string list'),
  'oscillators.0.enabled': metadata(z.boolean(), 'boolean'),
  'oscillators.0.wavetableId': metadata(z.string().trim().min(1).max(64), 'wavetable id'),
  'oscillators.0.wavetablePosition': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.0.level': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.0.transposeSemitones': metadata(z.number().int().min(-24).max(24), 'semitones'),
  'oscillators.0.fineTuneCents': metadata(z.number().finite().min(-100).max(100), 'cents'),
  'oscillators.0.unisonVoices': metadata(z.number().int().min(1).max(8), 'voice count'),
  'oscillators.0.unisonDetune': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.0.stereoSpread': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.0.randomPhase': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.0.pan': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.enabled': metadata(z.boolean(), 'boolean'),
  'oscillators.1.wavetableId': metadata(z.string().trim().min(1).max(64), 'wavetable id'),
  'oscillators.1.wavetablePosition': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.level': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.transposeSemitones': metadata(z.number().int().min(-24).max(24), 'semitones'),
  'oscillators.1.fineTuneCents': metadata(z.number().finite().min(-100).max(100), 'cents'),
  'oscillators.1.unisonVoices': metadata(z.number().int().min(1).max(8), 'voice count'),
  'oscillators.1.unisonDetune': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.stereoSpread': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.randomPhase': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.1.pan': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.enabled': metadata(z.boolean(), 'boolean'),
  'oscillators.2.wavetableId': metadata(z.string().trim().min(1).max(64), 'wavetable id'),
  'oscillators.2.wavetablePosition': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.level': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.transposeSemitones': metadata(z.number().int().min(-24).max(24), 'semitones'),
  'oscillators.2.fineTuneCents': metadata(z.number().finite().min(-100).max(100), 'cents'),
  'oscillators.2.unisonVoices': metadata(z.number().int().min(1).max(8), 'voice count'),
  'oscillators.2.unisonDetune': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.stereoSpread': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.randomPhase': metadata(unitInterval, 'normalized 0..1'),
  'oscillators.2.pan': metadata(unitInterval, 'normalized 0..1'),
  'ampEnvelope.delaySeconds': metadata(seconds(ENVELOPE_DELAY_MAX_SECONDS), 'seconds'),
  'ampEnvelope.attackSeconds': metadata(seconds(10), 'seconds'),
  'ampEnvelope.holdSeconds': metadata(seconds(ENVELOPE_HOLD_MAX_SECONDS), 'seconds'),
  'ampEnvelope.decaySeconds': metadata(seconds(10), 'seconds'),
  'ampEnvelope.sustainLevel': metadata(unitInterval, 'normalized 0..1'),
  'ampEnvelope.releaseSeconds': metadata(seconds(20), 'seconds'),
  'ampEnvelope.attackCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'ampEnvelope.decayCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'ampEnvelope.releaseCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'modEnvelope.delaySeconds': metadata(seconds(ENVELOPE_DELAY_MAX_SECONDS), 'seconds'),
  'modEnvelope.attackSeconds': metadata(seconds(10), 'seconds'),
  'modEnvelope.holdSeconds': metadata(seconds(ENVELOPE_HOLD_MAX_SECONDS), 'seconds'),
  'modEnvelope.decaySeconds': metadata(seconds(10), 'seconds'),
  'modEnvelope.sustainLevel': metadata(unitInterval, 'normalized 0..1'),
  'modEnvelope.releaseSeconds': metadata(seconds(20), 'seconds'),
  'modEnvelope.attackCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'modEnvelope.decayCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'modEnvelope.releaseCurve': metadata(z.number().finite().min(-1).max(1), 'curve -1..1'),
  'filter.enabled': metadata(z.boolean(), 'boolean'),
  'filter.type': metadata(z.enum(FILTER_TYPES), 'enum'),
  'filter.cutoffHz': metadata(z.number().int().finite().min(FILTER_CUTOFF_MIN_HZ).max(FILTER_CUTOFF_MAX_HZ), 'hertz'),
  'filter.resonance': metadata(unitInterval, 'normalized 0..1'),
  'filter.slope': metadata(z.union(FILTER_SLOPES.map((slope) => z.literal(slope)) as [z.ZodLiteral<12>, z.ZodLiteral<24>]), 'dB/octave'),
  'filter.drive': metadata(unitInterval, 'normalized 0..1'),
  'filter.keytrack': metadata(unitInterval, 'normalized 0..1'),
  'filter.velocityToCutoff': metadata(unitInterval, 'normalized 0..1'),
  'lfo1.enabled': metadata(z.boolean(), 'boolean'),
  'lfo1.points': metadata(lfoPoints, 'normalized point list'),
  'lfo1.rate': metadata(lfoRate, 'tempo division or hertz'),
  'lfo1.phase': metadata(unitInterval, 'normalized 0..1'),
  'lfo1.smooth': metadata(z.boolean(), 'boolean'),
  'lfo1.smoothing': metadata(unitInterval, 'normalized 0..1'),
  'lfo1.target': metadata(z.enum(LFO_TARGETS), 'enum'),
  'lfo1.scope': metadata(z.union([z.literal('all'), z.literal(1), z.literal(2), z.literal(3)]), 'all or oscillator number'),
  'lfo1.depth': metadata(unitInterval, 'normalized 0..1'),
  'lfo2.enabled': metadata(z.boolean(), 'boolean'),
  'lfo2.points': metadata(lfoPoints, 'normalized point list'),
  'lfo2.rate': metadata(lfoRate, 'tempo division or hertz'),
  'lfo2.phase': metadata(unitInterval, 'normalized 0..1'),
  'lfo2.smooth': metadata(z.boolean(), 'boolean'),
  'lfo2.smoothing': metadata(unitInterval, 'normalized 0..1'),
  'lfo2.target': metadata(z.enum(LFO_TARGETS), 'enum'),
  'lfo2.scope': metadata(z.union([z.literal('all'), z.literal(1), z.literal(2), z.literal(3)]), 'all or oscillator number'),
  'lfo2.depth': metadata(unitInterval, 'normalized 0..1'),
  'voice.polyphony': metadata(z.number().int().min(1).max(16), 'voice count'),
  'voice.legato': metadata(z.boolean(), 'boolean'),
  'voice.glideSeconds': metadata(seconds(5), 'seconds'),
  'voice.velocitySensitivity': metadata(unitInterval, 'normalized 0..1'),
  'voice.transposeSemitones': metadata(z.number().int().min(-36).max(36), 'semitones'),
  'effects.order': metadata(z.array(z.enum(EFFECT_IDS)).length(EFFECT_IDS.length).refine((order) => new Set(order).size === EFFECT_IDS.length, 'Effect order must contain each effect exactly once'), 'ordered effect id list'),
  'effects.distortion.enabled': metadata(z.boolean(), 'boolean'),
  'effects.distortion.type': metadata(z.enum(DISTORTION_TYPES), 'enum'),
  'effects.distortion.drive': metadata(unitInterval, 'normalized 0..1'),
  'effects.distortion.mix': metadata(unitInterval, 'normalized 0..1'),
  'effects.compressor.enabled': metadata(z.boolean(), 'boolean'),
  'effects.compressor.bands': metadata(z.enum(COMPRESSOR_BANDS), 'enum'),
  'effects.compressor.amount': metadata(unitInterval, 'normalized 0..1'),
  'effects.compressor.attack': metadata(unitInterval, 'normalized 0..1'),
  'effects.compressor.release': metadata(unitInterval, 'normalized 0..1'),
  'effects.compressor.mix': metadata(unitInterval, 'normalized 0..1'),
  'effects.chorus.enabled': metadata(z.boolean(), 'boolean'),
  'effects.chorus.voices': metadata(z.number().int().min(1).max(4), 'voice count'),
  'effects.chorus.rate': metadata(unitInterval, 'normalized 0..1'),
  'effects.chorus.depth': metadata(unitInterval, 'normalized 0..1'),
  'effects.chorus.feedback': metadata(unitInterval, 'normalized 0..1'),
  'effects.chorus.mix': metadata(unitInterval, 'normalized 0..1'),
  'effects.delay.enabled': metadata(z.boolean(), 'boolean'),
  'effects.delay.mode': metadata(z.enum(['sync', 'free']), 'enum'),
  'effects.delay.division': metadata(z.enum(TEMPO_SYNC_DIVISIONS), 'tempo division'),
  'effects.delay.timeSeconds': metadata(secondsRange(DELAY_TIME_MIN_SECONDS, DELAY_TIME_MAX_SECONDS), 'seconds'),
  'effects.delay.feedback': metadata(unitInterval, 'normalized 0..1'),
  'effects.delay.mix': metadata(unitInterval, 'normalized 0..1'),
  'effects.reverb.enabled': metadata(z.boolean(), 'boolean'),
  'effects.reverb.mix': metadata(unitInterval, 'normalized 0..1'),
  'effects.reverb.decaySeconds': metadata(secondsRange(REVERB_DECAY_MIN_SECONDS, REVERB_DECAY_MAX_SECONDS), 'seconds'),
  'effects.reverb.size': metadata(unitInterval, 'normalized 0..1'),
  'effects.reverb.predelay': metadata(seconds(REVERB_PREDELAY_MAX_SECONDS), 'seconds'),
  'effects.reverb.lowCut': metadata(unitInterval, 'normalized 0..1'),
  'effects.reverb.highCut': metadata(unitInterval, 'normalized 0..1'),
} as const satisfies Record<string, PatchPathMetadata>

export type SupportedPatchPath = keyof typeof PATCH_PATH_REGISTRY
export const SUPPORTED_PATCH_PATHS = Object.freeze(
  Object.keys(PATCH_PATH_REGISTRY) as SupportedPatchPath[],
)

export const AGENT_EDITABLE_PATCH_PATHS = SUPPORTED_PATCH_PATHS

export function isAgentEditablePatchPath(path: unknown): path is SupportedPatchPath {
  return typeof path === 'string' && AGENT_EDITABLE_PATCH_PATHS.includes(path as SupportedPatchPath)
}

export const PATCH_PATH_VALUE_SCHEMAS: Readonly<Record<SupportedPatchPath, ZodTypeAny>> =
  Object.freeze(Object.fromEntries(SUPPORTED_PATCH_PATHS.map((path) => [
    path, PATCH_PATH_REGISTRY[path].validator,
  ])) as Record<SupportedPatchPath, ZodTypeAny>)

const supportedPathSet = new Set<string>(SUPPORTED_PATCH_PATHS)

export function isSupportedPatchPath(path: string): path is SupportedPatchPath {
  return supportedPathSet.has(path)
}

export function parsePatchPathValue(path: SupportedPatchPath, value: unknown): unknown {
  return PATCH_PATH_REGISTRY[path].validator.parse(value)
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
