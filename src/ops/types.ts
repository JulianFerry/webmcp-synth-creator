import type { TempoSyncDivision } from '../patch/limits'
import type { SupportedPatchPath } from '../patch/paths'

export type ArticulationKind = 'pluck' | 'stab' | 'percussive' | 'keys' | 'bell' | 'pad' | 'swell' | 'sustain' | 'reverse'
export type TimbreCharacter = 'pure' | 'warm' | 'bright' | 'hollow' | 'vocal' | 'metallic' | 'glassy' | 'harsh' | 'digital'
export type MovementShape = 'sine' | 'triangle' | 'ramp_up' | 'ramp_down' | 'random' | 'smooth_random'
export type GatePattern = 'even_8' | 'even_16' | 'offbeat' | 'long_short' | 'short_long' | 'triplet' | 'dotted' | 'swung' | 'stutter' | 'none'

export type Operation =
  | { op: 'tone'; brightness: number; keep_air?: boolean; resonance?: number }
  | { op: 'articulation'; kind: ArticulationKind; speed?: number }
  | { op: 'timbre'; character: TimbreCharacter; position?: number; target?: 1 | 2 | 3 | 'both' | 'all' }
  | { op: 'width'; amount: number; method?: 'unison' | 'pan' | 'stereo_fx' | 'auto' }
  | { op: 'space'; amount: number; size?: number; delay_amount?: number; predelay?: number }
  | { op: 'drive'; amount: number; character?: 'soft' | 'hard' | 'fold' | 'crush' }
  | { op: 'movement'; amount: number; rate?: number; target?: 'position' | 'cutoff' | 'pitch' | 'pan' | 'level'; shape?: MovementShape; sync?: boolean }
  | { op: 'gate'; pattern: GatePattern; division?: TempoSyncDivision; depth?: number; smoothing?: number; target?: 'level' | 'cutoff' | 'both' }
  | { op: 'balance'; osc1?: number; osc2?: number; osc3?: number }
  | { op: 'layer'; role: 'sub' | 'octave_up' | 'fifth' | 'unison_detune' | 'none'; level?: number; wavetable?: string }
  | { op: 'pitch'; octave?: number; semitones?: number; glide?: number; mono?: boolean; legato?: boolean }
  | { op: 'response'; velocity_to_level?: number; velocity_to_cutoff?: number; keytrack?: number }

export type RawChange = { path: SupportedPatchPath; value: unknown }
export type Change = Operation | RawChange
