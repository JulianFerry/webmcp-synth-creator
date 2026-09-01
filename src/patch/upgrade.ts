import type { OscillatorState } from './types'
import { DEFAULT_EFFECT_ORDER } from './effects'

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
  let document = structuredClone(value as Record<string, unknown>)
  let changed = false
  if (document.version === 1 && Array.isArray(document.oscillators) && document.oscillators.length === 2) {
    const first = document.oscillators[0]
    if (!first || typeof first !== 'object' || Array.isArray(first)) return value
    const wavetableId = (first as Record<string, unknown>).wavetableId
    if (typeof wavetableId !== 'string') return value
    document = {
      ...document,
      version: 2,
      oscillators: [
        ...document.oscillators,
        { ...THIRD_OSCILLATOR_DEFAULTS, wavetableId },
      ],
    }
    changed = true
  }

  const effects = document.effects
  if (document.version === 2 && effects && typeof effects === 'object' && !Array.isArray(effects) && !('order' in effects)) {
    document.effects = { ...(effects as Record<string, unknown>), order: [...DEFAULT_EFFECT_ORDER] }
    changed = true
  }

  return changed ? document : value
}
