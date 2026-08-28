const A4_MIDI = 69
const A4_HZ = 440

export const MAX_UNISON_DETUNE_CENTS = 50

export interface UnisonVoicePlacement {
  detuneCents: number
  pan: number
  gain: number
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
  const gain = 1 / voiceCount

  return Array.from({ length: voiceCount }, (_, index) => {
    const placement = voiceCount === 1 ? 0 : (index / (voiceCount - 1)) * 2 - 1
    return {
      detuneCents: placement * detuneCents,
      pan: placement * spread,
      gain,
    }
  })
}
