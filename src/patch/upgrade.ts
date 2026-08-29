import type { OscillatorState } from './types'

const THIRD_OSCILLATOR_DEFAULTS = {
  enabled: false,
  wavetablePosition: 0,
  level: 0,
  transposeSemitones: 0,
  fineTuneCents: 0,
  unisonVoices: 1,
  unisonDetune: 0,
  stereoSpread: 0,
  randomPhase: 0,
} as const satisfies Omit<OscillatorState, 'wavetableId'>

export function upgradePatchDocument(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const document = value as Record<string, unknown>
  if (document.version !== 1 || !Array.isArray(document.oscillators) || document.oscillators.length !== 2) {
    return value
  }
  const first = document.oscillators[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return value
  const wavetableId = (first as Record<string, unknown>).wavetableId
  if (typeof wavetableId !== 'string') return value

  return {
    ...structuredClone(document),
    version: 2,
    oscillators: [
      ...structuredClone(document.oscillators),
      { ...THIRD_OSCILLATOR_DEFAULTS, wavetableId },
    ],
  }
}
