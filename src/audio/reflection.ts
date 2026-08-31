import type {
  DelayState,
  EnvelopeState,
  FilterState,
  LfoState,
  ModulationRoute,
  OscillatorState,
  PatchState,
  ReverbState,
  VoiceState,
} from '../patch/types'

export interface OscillatorReflection {
  enabled: boolean
  wavetablePosition: number
  level: number
  transposeSemitones: number
  fineTuneCents: number
  unisonVoices: number
  unisonDetune: number
  stereoSpread: number
}

export interface AudioPatchReflection {
  oscillators: [OscillatorReflection, OscillatorReflection]
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: LfoState
  modulations: ModulationRoute[]
  voice: VoiceState
  effects: { delay: DelayState; reverb: ReverbState }
}

export function oscillatorReflection(oscillator: OscillatorState): OscillatorReflection {
  return {
    enabled: oscillator.enabled,
    wavetablePosition: oscillator.wavetablePosition,
    level: oscillator.level,
    transposeSemitones: oscillator.transposeSemitones,
    fineTuneCents: oscillator.fineTuneCents,
    unisonVoices: oscillator.unisonVoices,
    unisonDetune: oscillator.unisonDetune,
    stereoSpread: oscillator.stereoSpread,
  }
}

export function patchReflection(patch: PatchState): AudioPatchReflection {
  return {
    oscillators: [
      oscillatorReflection(patch.oscillators[0]),
      oscillatorReflection(patch.oscillators[1]),
    ],
    ampEnvelope: structuredClone(patch.ampEnvelope),
    modEnvelope: structuredClone(patch.modEnvelope),
    filter: structuredClone(patch.filter),
    lfo1: structuredClone(patch.lfo1),
    modulations: structuredClone(patch.modulations),
    voice: structuredClone(patch.voice),
    effects: structuredClone(patch.effects),
  }
}
