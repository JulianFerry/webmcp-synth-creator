import type { EnvelopeState, LfoState, OscillatorState } from './types'
import { nearestStraightLfoDivision } from '../audio/lfo'
import { DEFAULT_EFFECT_ORDER } from './effects'
import { DEFAULT_COMPRESSOR_STATE } from './compressor'
import {
  LEGACY_ENVELOPE_ATTACK_CURVE,
  LEGACY_ENVELOPE_DECAY_RELEASE_CURVE,
  LEGACY_LFO_SMOOTHING_OFF,
  LEGACY_LFO_SMOOTHING_ON,
} from './limits'

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
  pan: 0.5,
} as const satisfies Omit<OscillatorState, 'wavetableId'>

const envelopeV3Defaults = {
  delaySeconds: 0,
  attackCurve: LEGACY_ENVELOPE_ATTACK_CURVE,
  decayCurve: LEGACY_ENVELOPE_DECAY_RELEASE_CURVE,
  releaseCurve: LEGACY_ENVELOPE_DECAY_RELEASE_CURVE,
} as const satisfies Pick<
  EnvelopeState,
  'delaySeconds' | 'attackCurve' | 'decayCurve' | 'releaseCurve'
>

const SECOND_LFO_DEFAULTS = {
  enabled: false,
  points: [{ x: 0, y: 0.5, power: 0 }, { x: 1, y: 0.5, power: 0 }],
  rate: { mode: 'sync', division: '1/4' },
  phase: 0,
  smooth: false,
  smoothing: LEGACY_LFO_SMOOTHING_OFF,
  target: 'position',
  scope: 'all',
  depth: 0,
} as const satisfies LfoState

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

  if (document.version === 2) {
    const oscillators = Array.isArray(document.oscillators) ? document.oscillators : null
    const ampEnvelope = document.ampEnvelope
    const modEnvelope = document.modEnvelope
    const filter = document.filter
    const lfo1 = document.lfo1
    const voice = document.voice
    const currentEffects = document.effects
    if (
      !oscillators || oscillators.length !== 3 ||
      !ampEnvelope || typeof ampEnvelope !== 'object' || Array.isArray(ampEnvelope) ||
      !modEnvelope || typeof modEnvelope !== 'object' || Array.isArray(modEnvelope) ||
      !filter || typeof filter !== 'object' || Array.isArray(filter) ||
      !lfo1 || typeof lfo1 !== 'object' || Array.isArray(lfo1) ||
      !voice || typeof voice !== 'object' || Array.isArray(voice) ||
      !currentEffects || typeof currentEffects !== 'object' || Array.isArray(currentEffects)
    ) return value
    const smooth = (lfo1 as Record<string, unknown>).smooth
    if (typeof smooth !== 'boolean') return value
    document = {
      ...document,
      version: 3,
      oscillators: oscillators.map((oscillator) => ({
        ...(oscillator as Record<string, unknown>),
        pan: 0.5,
      })),
      ampEnvelope: { ...(ampEnvelope as Record<string, unknown>), ...envelopeV3Defaults },
      modEnvelope: { ...(modEnvelope as Record<string, unknown>), ...envelopeV3Defaults },
      filter: { ...(filter as Record<string, unknown>), slope: 12, drive: 0, keytrack: 0 },
      lfo1: {
        ...(lfo1 as Record<string, unknown>),
        smoothing: smooth ? LEGACY_LFO_SMOOTHING_ON : LEGACY_LFO_SMOOTHING_OFF,
      },
      voice: { ...(voice as Record<string, unknown>), transposeSemitones: 0 },
      effects: {
        ...(currentEffects as Record<string, unknown>),
        distortion: { enabled: false, type: 'soft_clip', drive: 0, mix: 0 },
        chorus: { enabled: false, voices: 4, rate: 0.5, depth: 0.5, feedback: 0, mix: 0 },
        reverb: {
          ...((currentEffects as Record<string, unknown>).reverb as Record<string, unknown>),
          predelay: 0,
          lowCut: 0,
          highCut: 110 / 128,
        },
      },
    }
    changed = true
  }

  if (document.version === 3) {
    const lfo1 = document.lfo1
    if (!lfo1 || typeof lfo1 !== 'object' || Array.isArray(lfo1)) return value
    document = {
      ...document,
      version: 4,
      lfo1: {
        ...(lfo1 as Record<string, unknown>),
        target: 'level',
        scope: 'all',
        depth: 0.68,
      },
      lfo2: structuredClone(SECOND_LFO_DEFAULTS),
      effects: {
        ...(document.effects as Record<string, unknown>),
        compressor: structuredClone(DEFAULT_COMPRESSOR_STATE),
      },
    }
    changed = true
  }

  for (const key of ['lfo1', 'lfo2'] as const) {
    const lfo = document[key]
    if (!lfo || typeof lfo !== 'object' || Array.isArray(lfo)) continue
    const rate = (lfo as Record<string, unknown>).rate
    if (!rate || typeof rate !== 'object' || Array.isArray(rate)) continue
    const legacyRate = rate as Record<string, unknown>
    if (legacyRate.mode !== 'free' || typeof legacyRate.hz !== 'number') continue
    document[key] = {
      ...(lfo as Record<string, unknown>),
      rate: { mode: 'sync', division: nearestStraightLfoDivision(legacyRate.hz) },
    }
    changed = true
  }

  return changed ? document : value
}
