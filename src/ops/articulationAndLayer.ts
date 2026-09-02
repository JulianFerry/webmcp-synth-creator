import type { EnvelopeState, PatchState } from '../patch/types'
import { scaleEnvelopeTimes } from './normalization'
import type { ArticulationKind, Operation, RawChange } from './types'

type EnvelopePreset = Pick<EnvelopeState, 'delaySeconds' | 'attackSeconds' | 'holdSeconds' | 'decaySeconds' | 'sustainLevel' | 'releaseSeconds' | 'decayCurve'>
const ARTICULATIONS: Record<ArticulationKind, EnvelopePreset> = {
  pluck: { delaySeconds: 0, attackSeconds: 0, holdSeconds: 0, decaySeconds: 0.18, sustainLevel: 0, releaseSeconds: 0.12, decayCurve: -0.6 },
  stab: { delaySeconds: 0, attackSeconds: 0, holdSeconds: 0, decaySeconds: 0.1, sustainLevel: 0, releaseSeconds: 0.06, decayCurve: -0.7 },
  percussive: { delaySeconds: 0, attackSeconds: 0, holdSeconds: 0, decaySeconds: 0.06, sustainLevel: 0, releaseSeconds: 0.04, decayCurve: -0.8 },
  keys: { delaySeconds: 0, attackSeconds: 0, holdSeconds: 0, decaySeconds: 0.35, sustainLevel: 0.45, releaseSeconds: 0.25, decayCurve: -0.5 },
  bell: { delaySeconds: 0, attackSeconds: 0, holdSeconds: 0, decaySeconds: 0.55, sustainLevel: 0, releaseSeconds: 0.5, decayCurve: -0.8 },
  pad: { delaySeconds: 0, attackSeconds: 0.45, holdSeconds: 0, decaySeconds: 0.4, sustainLevel: 0.85, releaseSeconds: 0.62, decayCurve: 0 },
  swell: { delaySeconds: 0, attackSeconds: 0.72, holdSeconds: 0, decaySeconds: 0.3, sustainLevel: 0.9, releaseSeconds: 0.7, decayCurve: 0.3 },
  sustain: { delaySeconds: 0, attackSeconds: 0.02, holdSeconds: 0, decaySeconds: 0.1, sustainLevel: 1, releaseSeconds: 0.15, decayCurve: 0 },
  reverse: { delaySeconds: 0, attackSeconds: 0.85, holdSeconds: 0.05, decaySeconds: 0.05, sustainLevel: 0, releaseSeconds: 0.02, decayCurve: 0.5 },
}

export function resolveArticulation(patch: PatchState, op: Extract<Operation, { op: 'articulation' }>): RawChange[] {
  const scaled = scaleEnvelopeTimes({ ...patch.ampEnvelope, ...ARTICULATIONS[op.kind] }, op.speed ?? 0.5)
  return ['delaySeconds', 'attackSeconds', 'holdSeconds', 'decaySeconds', 'sustainLevel', 'releaseSeconds', 'decayCurve'].map((field) => ({
    path: `ampEnvelope.${field}`,
    value: scaled[field as keyof EnvelopeState],
  })) as RawChange[]
}

const LAYERS = {
  sub: { transposeSemitones: -12, level: 0.35, unisonVoices: 1, unisonDetune: 0, wavetableId: 'sine' },
  octave_up: { transposeSemitones: 12, level: 0.22, unisonVoices: 1, unisonDetune: 0 },
  fifth: { transposeSemitones: 7, level: 0.18, unisonVoices: 1, unisonDetune: 0 },
  unison_detune: { transposeSemitones: 0, level: 0.45, unisonVoices: 3, unisonDetune: 0.4 },
} as const

export function resolveLayer(patch: PatchState, op: Extract<Operation, { op: 'layer' }>): RawChange[] {
  if (op.role === 'none') return [{ path: 'oscillators.1.level', value: 0 }, { path: 'oscillators.1.enabled', value: false }]
  const layer = LAYERS[op.role]
  return [
    { path: 'oscillators.1.enabled', value: true },
    { path: 'oscillators.1.transposeSemitones', value: layer.transposeSemitones },
    { path: 'oscillators.1.unisonVoices', value: layer.unisonVoices },
    { path: 'oscillators.1.unisonDetune', value: layer.unisonDetune },
    { path: 'oscillators.1.wavetableId', value: op.wavetable ?? ('wavetableId' in layer ? layer.wavetableId : patch.oscillators[0].wavetableId) },
    ...(op.level === undefined ? [] : [{ path: 'oscillators.1.level' as const, value: op.level }]),
  ]
}
