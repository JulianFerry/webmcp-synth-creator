const A4_MIDI = 69
const A4_HZ = 440

// The pinned Vital Init keeps osc_*_detune_range at two cents per effective
// unison-detune percent. The quadratic export boundary maps the logical range
// to Vital's effective 0..12%, so both engines reach 24 cents at maximum.
export const MAX_UNISON_DETUNE_CENTS = 24
const VITAL_UNISON_DETUNE_POWER = 1.5

export interface UnisonVoicePlacement {
  detuneCents: number
  pan: number
  gain: number
}

export function vitalPowerScale(value: number, power: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  if (Math.abs(power) < 0.01) return clamped
  return Math.expm1(power * clamped) / Math.expm1(power)
}

export function equalPowerMix(mix: number): { dry: number; wet: number } {
  const clamped = Math.max(0, Math.min(1, mix))
  if (clamped === 0) return { dry: 1, wet: 0 }
  if (clamped === 1) return { dry: 0, wet: 1 }
  return {
    dry: Math.cos((Math.PI * clamped) / 2),
    wet: Math.sin((Math.PI * clamped) / 2),
  }
}

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12)
}

export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200)
}

export function transposeFrequency(
  midi: number,
  transposeSemitones: number,
  fineTuneCents: number,
): number {
  return midiToHz(midi + transposeSemitones) * centsToRatio(fineTuneCents)
}

export function velocityToGain(velocity: number, sensitivity: number): number {
  const normalizedVelocity = Math.max(0, Math.min(1, velocity))
  const normalizedSensitivity = Math.max(0, Math.min(1, sensitivity))
  return 1 - normalizedSensitivity + normalizedSensitivity * normalizedVelocity
}

export function createUnisonPlacements(
  voiceCount: number,
  normalizedDetune: number,
  stereoSpread: number,
): UnisonVoicePlacement[] {
  if (!Number.isInteger(voiceCount) || voiceCount < 1) {
    throw new RangeError('Unison voice count must be a positive integer')
  }

  const detuneCents = Math.max(0, Math.min(1, normalizedDetune)) * MAX_UNISON_DETUNE_CENTS
  const spread = Math.max(0, Math.min(1, stereoSpread))
  // Preserve energy as voices are added. Dividing by voiceCount made a
  // five-voice patch about 7 dB quieter than its single-voice counterpart.
  const gain = 1 / Math.sqrt(voiceCount)

  return Array.from({ length: voiceCount }, (_, index) => {
    const placement = voiceCount === 1 ? 0 : (index / (voiceCount - 1)) * 2 - 1
    const detunePlacement =
      Math.sign(placement) * vitalPowerScale(Math.abs(placement), VITAL_UNISON_DETUNE_POWER)
    return {
      detuneCents: detunePlacement * detuneCents,
      pan: placement * spread,
      gain,
    }
  })
}
