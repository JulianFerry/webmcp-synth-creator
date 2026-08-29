import {
  DELAY_TIME_MAX_SECONDS,
  DELAY_TIME_MIN_SECONDS,
  ENVELOPE_HOLD_MAX_SECONDS,
  REVERB_DECAY_MAX_SECONDS,
  REVERB_DECAY_MIN_SECONDS,
} from '../patch/limits'

export type VitalEnvelopeTimeField = 'delay' | 'attack' | 'hold' | 'decay' | 'release'

const VITAL_ENVELOPE_MAX_SECONDS: Record<VitalEnvelopeTimeField, number> = {
  delay: ENVELOPE_HOLD_MAX_SECONDS,
  attack: 32,
  hold: ENVELOPE_HOLD_MAX_SECONDS,
  decay: 32,
  release: 32,
}

function assertRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`)
  }
}

export function encodeVitalOscillatorLevel(level: number): number {
  assertRange(level, 0, 1, 'Oscillator level')
  return Math.sqrt(level * 0.5)
}

export function decodeVitalOscillatorLevel(value: number): number {
  assertRange(value, 0, 1, 'Vital oscillator level')
  const decoded = value ** 2 * 2
  if (decoded > 1 + 1e-9) {
    throw new RangeError('Vital oscillator level exceeds the workbench 100% range')
  }
  return Math.min(1, decoded)
}

// Vital stores this quadratic control in the 0..10 square-root domain. Its
// effective/UI value is raw² percent, and the pinned detune range converts each
// effective percent to two cents. The workbench's 0..100% range is deliberately
// narrower: it represents 0..24 cents, or Vital's effective 0..12% range.
const VITAL_UNISON_PERCENT_AT_WORKBENCH_MAX = 12

export function encodeVitalUnisonDetune(detune: number): number {
  assertRange(detune, 0, 1, 'Unison detune')
  return Math.sqrt(detune * VITAL_UNISON_PERCENT_AT_WORKBENCH_MAX)
}

export function decodeVitalUnisonDetune(value: number): number {
  assertRange(value, 0, 10, 'Vital unison detune')
  const decoded = value ** 2 / VITAL_UNISON_PERCENT_AT_WORKBENCH_MAX
  if (decoded > 1 + 1e-9) {
    throw new RangeError('Vital unison detune exceeds the workbench 100% range')
  }
  return Math.min(1, decoded)
}

export function encodeVitalEnvelopeSeconds(
  seconds: number,
  field: VitalEnvelopeTimeField,
): number {
  assertRange(seconds, 0, VITAL_ENVELOPE_MAX_SECONDS[field], `Vital envelope ${field}`)
  return seconds ** 0.25
}

export function decodeVitalEnvelopeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Vital envelope value must be a non-negative finite number')
  }
  return value ** 4
}

export function encodeVitalDelaySeconds(seconds: number): number {
  assertRange(seconds, DELAY_TIME_MIN_SECONDS, DELAY_TIME_MAX_SECONDS, 'Vital delay time')
  return Math.log2(1 / seconds)
}

export function decodeVitalDelaySeconds(value: number): number {
  assertRange(value, -2, 9, 'Vital delay frequency value')
  return 1 / 2 ** value
}

export function encodeVitalReverbDecaySeconds(seconds: number): number {
  assertRange(
    seconds,
    REVERB_DECAY_MIN_SECONDS,
    REVERB_DECAY_MAX_SECONDS,
    'Vital reverb decay',
  )
  return Math.log2(seconds)
}

export function decodeVitalReverbDecaySeconds(value: number): number {
  assertRange(value, -6, 6, 'Vital reverb decay value')
  return 2 ** value
}

const VITAL_GLIDE_OFF_VALUE = -10

export function encodeVitalGlideSeconds(seconds: number): number {
  assertRange(seconds, 0, 5, 'Vital glide time')
  if (seconds === 0) return VITAL_GLIDE_OFF_VALUE
  return Math.max(VITAL_GLIDE_OFF_VALUE, Math.log2(seconds))
}

export function decodeVitalGlideSeconds(value: number): number {
  assertRange(value, VITAL_GLIDE_OFF_VALUE, Math.log2(5), 'Vital portamento time')
  return value === VITAL_GLIDE_OFF_VALUE ? 0 : 2 ** value
}
