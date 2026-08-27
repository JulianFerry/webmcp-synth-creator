import type { SupportedPatchPath } from './paths'

export type PatchCategory =
  | 'pad'
  | 'bass'
  | 'lead'
  | 'pluck'
  | 'keys'
  | 'atmosphere'
  | 'rhythmic'
  | 'other'

export interface PatchMetadata {
  name: string
  category?: PatchCategory
  description?: string
  tags: string[]
}

export interface OscillatorState {
  enabled: boolean
  wavetableId: string
  wavetablePosition: number
  level: number
  transposeSemitones: number
  fineTuneCents: number
  unisonVoices: number
  unisonDetune: number
  stereoSpread: number
  randomPhase: number
}

export interface EnvelopeState {
  attackSeconds: number
  holdSeconds: number
  decaySeconds: number
  sustainLevel: number
  releaseSeconds: number
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass'

export interface FilterState {
  enabled: boolean
  type: FilterType
  cutoffHz: number
  resonance: number
}

export interface LfoPoint {
  x: number
  y: number
  power?: number
}

export type LfoRate =
  | {
      mode: 'sync'
      division: '1/1' | '1/2' | '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T'
    }
  | {
      mode: 'free'
      hz: number
    }

export interface LfoState {
  points: LfoPoint[]
  rate: LfoRate
  phase: number
  smooth: boolean
}

export type ModulationSource = 'lfo1' | 'modEnvelope'

export type ModulationDestination =
  | 'oscillator1.level'
  | 'oscillator1.wavetablePosition'
  | 'oscillator1.pitch'
  | 'oscillator2.level'
  | 'oscillator2.wavetablePosition'
  | 'oscillator2.pitch'
  | 'filter.cutoff'

export interface ModulationRoute {
  id: string
  source: ModulationSource
  destination: ModulationDestination
  amount: number
  bipolar: boolean
}

export interface VoiceState {
  polyphony: number
  legato: boolean
  glideSeconds: number
  velocitySensitivity: number
}

export interface DelayState {
  enabled: boolean
  mode: 'sync' | 'free'
  division?: '1/4' | '1/8' | '1/8T' | '1/16'
  timeSeconds?: number
  feedback: number
  mix: number
}

export interface ReverbState {
  enabled: boolean
  mix: number
  decaySeconds: number
  size: number
}

export interface WavetableFrameState {
  harmonics: number[]
}

export interface WavetableState {
  id: string
  name: string
  frames: WavetableFrameState[]
}

export interface PatchState {
  version: 1
  metadata: PatchMetadata
  oscillators: [OscillatorState, OscillatorState]
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: LfoState
  modulations: ModulationRoute[]
  voice: VoiceState
  effects: {
    delay: DelayState
    reverb: ReverbState
  }
  wavetableData: Record<string, WavetableState>
}

export interface ApplyPatchCommand {
  type: 'apply_patch'
  reason: string
  changes: Array<{
    path: SupportedPatchPath
    value: unknown
  }>
}

export interface PatchSummary {
  name: string
  category: PatchCategory | null
  description: string | null
  tags: string[]
  oscillators: Array<{
    enabled: boolean
    wavetableId: string
    wavetablePosition: number
    level: number
    transposeSemitones: number
    fineTuneCents: number
    unisonVoices: number
    stereoSpread: number
  }>
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: {
    pointCount: number
    points: LfoPoint[]
    rate: LfoRate
    phase: number
    smooth: boolean
  }
  modulations: ModulationRoute[]
  voice: VoiceState
  effects: PatchState['effects']
  wavetables: Array<{
    id: string
    name: string
    frameCount: number
  }>
}

export interface CommandResult {
  patch: PatchState
  changed: Record<string, { before: unknown; after: unknown }>
  summary: PatchSummary
  canUndo: boolean
  correlationId: string
}
