import { getPatchPathValue, type SupportedPatchPath } from '../patch/paths'
import type { DistortionType, PatchState } from '../patch/types'
import {
  decodeVitalChorusRate,
  decodeVitalEnvelopeCurve,
  decodeVitalEnvelopeSeconds,
  decodeVitalFilterDrive,
  decodeVitalGlideSeconds,
  decodeVitalLfoSmoothing,
  decodeVitalOscillatorLevel,
  decodeVitalReverbDecaySeconds,
  decodeVitalReverbPredelay,
  decodeVitalUnisonDetune,
  encodeVitalChorusRate,
  encodeVitalEnvelopeCurve,
  encodeVitalEnvelopeSeconds,
  encodeVitalFilterDrive,
  encodeVitalGlideSeconds,
  encodeVitalLfoSmoothing,
  encodeVitalOscillatorLevel,
  encodeVitalReverbDecaySeconds,
  encodeVitalReverbPredelay,
  encodeVitalUnisonDetune,
  type VitalEnvelopeTimeField,
} from './units'

export type StructuralPath =
  | 'metadata.name'
  | 'metadata.category'
  | 'metadata.description'
  | 'metadata.tags'
  | `oscillators.${0 | 1 | 2}.wavetableId`
  | 'filter.type'
  | 'filter.slope'
  | 'filter.velocityToCutoff'
  | 'lfo1.enabled'
  | 'lfo1.points'
  | 'lfo1.rate'
  | 'lfo1.smooth'
  | 'lfo1.target'
  | 'lfo1.scope'
  | 'lfo1.depth'
  | 'lfo2.enabled'
  | 'lfo2.points'
  | 'lfo2.rate'
  | 'lfo2.smooth'
  | 'lfo2.target'
  | 'lfo2.scope'
  | 'lfo2.depth'
  | 'effects.order'
  | 'effects.delay.mode'
  | 'effects.delay.division'
  | 'effects.delay.timeSeconds'

export type VitalScalarPath = Exclude<SupportedPatchPath, StructuralPath>
export type VitalSettingOwnership = 'workbench' | 'forced'

export interface VitalScalarBinding {
  key: string
  ownership: 'workbench'
  encode: (patch: PatchState) => number
  decode: (settings: Record<string, unknown>) => unknown
}

export interface ForcedVitalBinding {
  key: string
  value: number
  ownership: 'forced'
  justification: string
}

function setting(settings: Record<string, unknown>, key: string): number {
  const value = settings[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`Vital setting ${key} must be a finite number`)
  }
  return value
}

type Codec = { encode(value: unknown): number; decode(value: number): unknown }
const numberCodec: Codec = { encode: Number, decode: (value) => value }
const booleanCodec: Codec = { encode: (value) => Number(value), decode: (value) => value === 1 }
const scaled = (encode: (value: number) => number, decode: (value: number) => unknown): Codec => ({
  encode: (value) => encode(value as number),
  decode,
})
const affine = (scale: number, offset = 0): Codec =>
  scaled((value) => value * scale + offset, (value) => (value - offset) / scale)

function bind(
  path: VitalScalarPath,
  key: string,
  codec: Codec = numberCodec,
  fallback?: unknown,
): VitalScalarBinding {
  return {
    key,
    ownership: 'workbench',
    encode: (patch) => codec.encode(getPatchPathValue(patch, path) ?? fallback),
    decode: (settings) => codec.decode(setting(settings, key)),
  }
}

const envelopeTime = (path: VitalScalarPath, key: string, field: VitalEnvelopeTimeField) =>
  bind(
    path,
    key,
    scaled((value) => encodeVitalEnvelopeSeconds(value, field), decodeVitalEnvelopeSeconds),
    field === 'delay' ? 0 : undefined,
  )
const envelopeCurve = (path: VitalScalarPath, key: string) =>
  bind(
    path,
    key,
    scaled(encodeVitalEnvelopeCurve, decodeVitalEnvelopeCurve),
    path.endsWith('attackCurve') ? 0 : -0.1,
  )
const oscillator = (index: 0 | 1 | 2, field: string, keyField: string, codec?: Codec) =>
  bind(`oscillators.${index}.${field}` as VitalScalarPath, `osc_${index + 1}_${keyField}`, codec)

const distortionTypes: Record<DistortionType, number> = {
  soft_clip: 0,
  hard_clip: 1,
  sine_fold: 3,
  bit_crush: 4,
}
const distortionTypeCodec: Codec = {
  encode: (value) => distortionTypes[value as DistortionType],
  decode: (value) => {
    const match = (Object.entries(distortionTypes) as Array<[DistortionType, number]>).find(
      ([, encoded]) => encoded === value,
    )
    if (!match) throw new RangeError(`Unsupported Vital distortion type: ${value}`)
    return match[0]
  },
}

export const VITAL_SCALAR_BINDINGS: Record<VitalScalarPath, VitalScalarBinding> = {
  'oscillators.0.enabled': oscillator(0, 'enabled', 'on', booleanCodec),
  'oscillators.0.wavetablePosition': oscillator(0, 'wavetablePosition', 'wave_frame', affine(256)),
  'oscillators.0.level': oscillator(0, 'level', 'level', scaled(encodeVitalOscillatorLevel, decodeVitalOscillatorLevel)),
  'oscillators.0.transposeSemitones': oscillator(0, 'transposeSemitones', 'transpose'),
  'oscillators.0.fineTuneCents': oscillator(0, 'fineTuneCents', 'tune', affine(0.01)),
  'oscillators.0.unisonVoices': oscillator(0, 'unisonVoices', 'unison_voices'),
  'oscillators.0.unisonDetune': oscillator(0, 'unisonDetune', 'unison_detune', scaled(encodeVitalUnisonDetune, decodeVitalUnisonDetune)),
  'oscillators.0.stereoSpread': oscillator(0, 'stereoSpread', 'stereo_spread'),
  'oscillators.0.randomPhase': oscillator(0, 'randomPhase', 'random_phase'),
  'oscillators.0.pan': bind('oscillators.0.pan', 'osc_1_pan', affine(2, -1), 0.5),
  'oscillators.1.enabled': oscillator(1, 'enabled', 'on', booleanCodec),
  'oscillators.1.wavetablePosition': oscillator(1, 'wavetablePosition', 'wave_frame', affine(256)),
  'oscillators.1.level': oscillator(1, 'level', 'level', scaled(encodeVitalOscillatorLevel, decodeVitalOscillatorLevel)),
  'oscillators.1.transposeSemitones': oscillator(1, 'transposeSemitones', 'transpose'),
  'oscillators.1.fineTuneCents': oscillator(1, 'fineTuneCents', 'tune', affine(0.01)),
  'oscillators.1.unisonVoices': oscillator(1, 'unisonVoices', 'unison_voices'),
  'oscillators.1.unisonDetune': oscillator(1, 'unisonDetune', 'unison_detune', scaled(encodeVitalUnisonDetune, decodeVitalUnisonDetune)),
  'oscillators.1.stereoSpread': oscillator(1, 'stereoSpread', 'stereo_spread'),
  'oscillators.1.randomPhase': oscillator(1, 'randomPhase', 'random_phase'),
  'oscillators.1.pan': bind('oscillators.1.pan', 'osc_2_pan', affine(2, -1), 0.5),
  'oscillators.2.enabled': oscillator(2, 'enabled', 'on', booleanCodec),
  'oscillators.2.wavetablePosition': oscillator(2, 'wavetablePosition', 'wave_frame', affine(256)),
  'oscillators.2.level': oscillator(2, 'level', 'level', scaled(encodeVitalOscillatorLevel, decodeVitalOscillatorLevel)),
  'oscillators.2.transposeSemitones': oscillator(2, 'transposeSemitones', 'transpose'),
  'oscillators.2.fineTuneCents': oscillator(2, 'fineTuneCents', 'tune', affine(0.01)),
  'oscillators.2.unisonVoices': oscillator(2, 'unisonVoices', 'unison_voices'),
  'oscillators.2.unisonDetune': oscillator(2, 'unisonDetune', 'unison_detune', scaled(encodeVitalUnisonDetune, decodeVitalUnisonDetune)),
  'oscillators.2.stereoSpread': oscillator(2, 'stereoSpread', 'stereo_spread'),
  'oscillators.2.randomPhase': oscillator(2, 'randomPhase', 'random_phase'),
  'oscillators.2.pan': bind('oscillators.2.pan', 'osc_3_pan', affine(2, -1), 0.5),
  'ampEnvelope.delaySeconds': envelopeTime('ampEnvelope.delaySeconds', 'env_1_delay', 'delay'),
  'ampEnvelope.attackSeconds': envelopeTime('ampEnvelope.attackSeconds', 'env_1_attack', 'attack'),
  'ampEnvelope.holdSeconds': envelopeTime('ampEnvelope.holdSeconds', 'env_1_hold', 'hold'),
  'ampEnvelope.decaySeconds': envelopeTime('ampEnvelope.decaySeconds', 'env_1_decay', 'decay'),
  'ampEnvelope.sustainLevel': bind('ampEnvelope.sustainLevel', 'env_1_sustain'),
  'ampEnvelope.releaseSeconds': envelopeTime('ampEnvelope.releaseSeconds', 'env_1_release', 'release'),
  'ampEnvelope.attackCurve': envelopeCurve('ampEnvelope.attackCurve', 'env_1_attack_power'),
  'ampEnvelope.decayCurve': envelopeCurve('ampEnvelope.decayCurve', 'env_1_decay_power'),
  'ampEnvelope.releaseCurve': envelopeCurve('ampEnvelope.releaseCurve', 'env_1_release_power'),
  'modEnvelope.delaySeconds': envelopeTime('modEnvelope.delaySeconds', 'env_2_delay', 'delay'),
  'modEnvelope.attackSeconds': envelopeTime('modEnvelope.attackSeconds', 'env_2_attack', 'attack'),
  'modEnvelope.holdSeconds': envelopeTime('modEnvelope.holdSeconds', 'env_2_hold', 'hold'),
  'modEnvelope.decaySeconds': envelopeTime('modEnvelope.decaySeconds', 'env_2_decay', 'decay'),
  'modEnvelope.sustainLevel': bind('modEnvelope.sustainLevel', 'env_2_sustain'),
  'modEnvelope.releaseSeconds': envelopeTime('modEnvelope.releaseSeconds', 'env_2_release', 'release'),
  'modEnvelope.attackCurve': envelopeCurve('modEnvelope.attackCurve', 'env_2_attack_power'),
  'modEnvelope.decayCurve': envelopeCurve('modEnvelope.decayCurve', 'env_2_decay_power'),
  'modEnvelope.releaseCurve': envelopeCurve('modEnvelope.releaseCurve', 'env_2_release_power'),
  'filter.enabled': bind('filter.enabled', 'filter_fx_on', booleanCodec),
  'filter.cutoffHz': bind('filter.cutoffHz', 'filter_fx_cutoff', scaled((hz) => 69 + 12 * Math.log2(hz / 440), (note) => Math.round(440 * 2 ** ((note - 69) / 12)))),
  'filter.resonance': bind('filter.resonance', 'filter_fx_resonance'),
  'filter.drive': bind('filter.drive', 'filter_fx_drive', scaled(encodeVitalFilterDrive, decodeVitalFilterDrive)),
  'filter.keytrack': bind('filter.keytrack', 'filter_fx_keytrack', affine(2, -1)),
  'lfo1.phase': bind('lfo1.phase', 'lfo_1_phase'),
  'lfo1.smoothing': {
    key: 'lfo_1_smooth_time',
    ownership: 'workbench',
    encode: (patch) =>
      encodeVitalLfoSmoothing(patch.lfo1.smoothing ?? (patch.lfo1.smooth ? 5 / 14 : 1.5 / 14)),
    decode: (settings) => decodeVitalLfoSmoothing(setting(settings, 'lfo_1_smooth_time')),
  },
  'lfo2.phase': bind('lfo2.phase', 'lfo_2_phase'),
  'lfo2.smoothing': {
    key: 'lfo_2_smooth_time',
    ownership: 'workbench',
    encode: (patch) => encodeVitalLfoSmoothing(patch.lfo2.smoothing),
    decode: (settings) => decodeVitalLfoSmoothing(setting(settings, 'lfo_2_smooth_time')),
  },
  'voice.polyphony': bind('voice.polyphony', 'polyphony'),
  'voice.legato': bind('voice.legato', 'legato', booleanCodec),
  'voice.glideSeconds': bind('voice.glideSeconds', 'portamento_time', scaled(encodeVitalGlideSeconds, decodeVitalGlideSeconds)),
  'voice.velocitySensitivity': bind('voice.velocitySensitivity', 'velocity_track'),
  'voice.transposeSemitones': bind('voice.transposeSemitones', 'voice_transpose'),
  'effects.distortion.enabled': bind('effects.distortion.enabled', 'distortion_on', booleanCodec),
  'effects.distortion.type': bind('effects.distortion.type', 'distortion_type', distortionTypeCodec),
  'effects.distortion.drive': bind('effects.distortion.drive', 'distortion_drive', affine(60, -30)),
  'effects.distortion.mix': bind('effects.distortion.mix', 'distortion_mix'),
  'effects.chorus.enabled': bind('effects.chorus.enabled', 'chorus_on', booleanCodec),
  'effects.chorus.voices': bind('effects.chorus.voices', 'chorus_voices'),
  'effects.chorus.rate': bind('effects.chorus.rate', 'chorus_frequency', scaled(encodeVitalChorusRate, decodeVitalChorusRate)),
  'effects.chorus.depth': bind('effects.chorus.depth', 'chorus_mod_depth'),
  'effects.chorus.feedback': bind('effects.chorus.feedback', 'chorus_feedback'),
  'effects.chorus.mix': bind('effects.chorus.mix', 'chorus_dry_wet'),
  'effects.delay.enabled': bind('effects.delay.enabled', 'delay_on', booleanCodec),
  'effects.delay.feedback': bind('effects.delay.feedback', 'delay_feedback'),
  'effects.delay.mix': bind('effects.delay.mix', 'delay_dry_wet'),
  'effects.reverb.enabled': bind('effects.reverb.enabled', 'reverb_on', booleanCodec),
  'effects.reverb.mix': bind('effects.reverb.mix', 'reverb_dry_wet'),
  'effects.reverb.decaySeconds': bind('effects.reverb.decaySeconds', 'reverb_decay_time', scaled(encodeVitalReverbDecaySeconds, decodeVitalReverbDecaySeconds)),
  'effects.reverb.size': bind('effects.reverb.size', 'reverb_size'),
  'effects.reverb.predelay': bind('effects.reverb.predelay', 'reverb_delay', scaled(encodeVitalReverbPredelay, decodeVitalReverbPredelay), 0),
  'effects.reverb.lowCut': bind('effects.reverb.lowCut', 'reverb_pre_low_cutoff', affine(128), 0),
  'effects.reverb.highCut': bind('effects.reverb.highCut', 'reverb_pre_high_cutoff', affine(128), 110 / 128),
}

export const FORCED_VITAL_BINDINGS = [
  { key: 'osc_1_destination', value: 3, ownership: 'forced', justification: 'Routes oscillator 1 directly to the modeled effects chain.' },
  { key: 'osc_2_destination', value: 3, ownership: 'forced', justification: 'Routes oscillator 2 directly to the modeled effects chain.' },
  { key: 'osc_3_destination', value: 3, ownership: 'forced', justification: 'Routes oscillator 3 directly to the modeled effects chain.' },
  { key: 'filter_1_on', value: 0, ownership: 'forced', justification: 'Disables the unsupported per-voice filter 1.' },
  { key: 'filter_2_on', value: 0, ownership: 'forced', justification: 'Disables the unsupported per-voice filter 2.' },
  { key: 'filter_fx_mix', value: 1, ownership: 'forced', justification: 'The modeled global filter is always fully wet.' },
  { key: 'eq_on', value: 0, ownership: 'forced', justification: 'Disables the unmodeled EQ.' },
  { key: 'flanger_on', value: 0, ownership: 'forced', justification: 'Disables the unmodeled flanger.' },
  { key: 'phaser_on', value: 0, ownership: 'forced', justification: 'Disables the unmodeled phaser.' },
  { key: 'lfo_1_sync_type', value: 0, ownership: 'forced', justification: 'The modeled LFO is always looping.' },
  { key: 'lfo_2_sync_type', value: 0, ownership: 'forced', justification: 'The modeled LFO is always looping.' },
] as const satisfies readonly ForcedVitalBinding[]

export function mapVitalScalarValues(patch: PatchState): Record<string, number> {
  return Object.fromEntries(
    Object.values(VITAL_SCALAR_BINDINGS).map((binding) => [binding.key, binding.encode(patch)]),
  )
}

export function decodeVitalScalarValues(settings: Record<string, unknown>): Record<VitalScalarPath, unknown> {
  return Object.fromEntries(
    (Object.entries(VITAL_SCALAR_BINDINGS) as Array<[VitalScalarPath, VitalScalarBinding]>).map(
      ([path, binding]) => [path, binding.decode(settings)],
    ),
  ) as Record<VitalScalarPath, unknown>
}

export const VITAL_BOUND_SETTING_KEYS = new Set([
  ...Object.values(VITAL_SCALAR_BINDINGS).map(({ key }) => key),
  ...FORCED_VITAL_BINDINGS.map(({ key }) => key),
])
