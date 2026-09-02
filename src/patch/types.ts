import type { SupportedPatchPath } from './paths'
import type { TempoSyncDivision } from './limits'
import type { EffectId } from './effects'

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
  pan: number
}

export interface EnvelopeState {
  delaySeconds: number
  attackSeconds: number
  holdSeconds: number
  decaySeconds: number
  sustainLevel: number
  releaseSeconds: number
  attackCurve: number
  decayCurve: number
  releaseCurve: number
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch'

export interface FilterState {
  enabled: boolean
  type: FilterType
  cutoffHz: number
  resonance: number
  slope: 12 | 24
  drive: number
  keytrack: number
}

export interface LfoPoint {
  x: number
  y: number
  power?: number
}

export type LfoRate =
  | {
      mode: 'sync'
      division: TempoSyncDivision
    }
  | {
      mode: 'free'
      hz: number
    }

export interface LfoState {
  enabled: boolean
  points: LfoPoint[]
  rate: LfoRate
  phase: number
  smooth: boolean
  smoothing: number
}

export type ModulationSource = 'lfo1' | 'modEnvelope' | 'velocity'

export type ModulationDestination =
  | 'oscillator1.level'
  | 'oscillator1.wavetablePosition'
  | 'oscillator1.pitch'
  | 'oscillator1.pan'
  | 'oscillator2.level'
  | 'oscillator2.wavetablePosition'
  | 'oscillator2.pitch'
  | 'oscillator2.pan'
  | 'oscillator3.level'
  | 'oscillator3.wavetablePosition'
  | 'oscillator3.pitch'
  | 'oscillator3.pan'
  | 'filter.cutoff'
  | 'volume'

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
  transposeSemitones: number
}

export type DistortionType = 'soft_clip' | 'hard_clip' | 'sine_fold' | 'bit_crush'

export interface DistortionState {
  enabled: boolean
  type: DistortionType
  drive: number
  mix: number
}

export interface ChorusState {
  enabled: boolean
  voices: number
  rate: number
  depth: number
  feedback: number
  mix: number
}

export interface DelayState {
  enabled: boolean
  mode: 'sync' | 'free'
  division?: TempoSyncDivision
  timeSeconds?: number
  feedback: number
  mix: number
}

export interface ReverbState {
  enabled: boolean
  mix: number
  decaySeconds: number
  size: number
  predelay: number
  lowCut: number
  highCut: number
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
  version: 3
  metadata: PatchMetadata
  oscillators: [OscillatorState, OscillatorState, OscillatorState]
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: LfoState
  modulations: ModulationRoute[]
  voice: VoiceState
  effects: {
    order: EffectId[]
    distortion: DistortionState
    chorus: ChorusState
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

export interface SetLfoShapeCommand {
  type: 'set_lfo_shape'
  reason: string
  points: LfoPoint[]
  smooth?: boolean
}

export interface SetLfoPointCommand {
  type: 'set_lfo_point'
  reason: string
  index: number
  x?: number
  y?: number
  power?: number
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
    pan: number
  }>
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: {
    enabled: boolean
    pointCount: number
    points: LfoPoint[]
    rate: LfoRate
    phase: number
    smooth: boolean
    smoothing: number
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
