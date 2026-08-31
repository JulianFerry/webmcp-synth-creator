import { parsePatchState } from '../../patch/schemas'
import type { PatchState } from '../../patch/types'
import { createWavetableData } from '../../wavetables/registry'

type CalibrationStage = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'

export interface CalibrationPresetEntry {
  id: `calibration-${CalibrationStage}-${string}`
  patch: PatchState
}

function referencedWavetables(patch: PatchState): string[] {
  return [...new Set(patch.oscillators.map(({ wavetableId }) => wavetableId))]
}

function createNextStage(
  previous: PatchState,
  metadata: PatchState['metadata'],
  mutate: (patch: PatchState) => void,
): PatchState {
  const next = structuredClone(previous)
  next.metadata = metadata
  mutate(next)
  next.wavetableData = createWavetableData(referencedWavetables(next))
  return parsePatchState(next)
}

export const CALIBRATION_A_PATCH = parsePatchState({
  version: 1,
  metadata: {
    name: 'Calibration A — OSC1 Sine',
    category: 'other',
    description:
      'Reference stage: one retriggered sine oscillator with a neutral gate envelope and every optional subsystem bypassed.',
    tags: ['calibration', 'stage-a', 'osc1', 'sine'],
  },
  oscillators: [
    {
      enabled: true,
      wavetableId: 'sine',
      wavetablePosition: 0.62,
      level: 1,
      transposeSemitones: 0,
      fineTuneCents: 0,
      unisonVoices: 1,
      unisonDetune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    },
    {
      enabled: false,
      wavetableId: 'sine',
      wavetablePosition: 0,
      level: 1,
      transposeSemitones: 12,
      fineTuneCents: 0,
      unisonVoices: 1,
      unisonDetune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    },
  ],
  ampEnvelope: {
    attackSeconds: 0,
    holdSeconds: 0,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.005,
  },
  modEnvelope: {
    attackSeconds: 0,
    holdSeconds: 0,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.005,
  },
  filter: {
    enabled: false,
    type: 'lowpass',
    cutoffHz: 4200,
    resonance: 0.12,
  },
  lfo1: {
    enabled: false,
    points: [
      { x: 0, y: 1 },
      { x: 0.03, y: 1 },
      { x: 0.05, y: 0 },
      { x: 0.45, y: 0 },
      { x: 0.47, y: 1 },
      { x: 1, y: 1 },
    ],
    rate: { mode: 'sync', division: '1/8' },
    phase: 0,
    smooth: false,
  },
  modulations: [],
  voice: {
    polyphony: 8,
    legato: false,
    glideSeconds: 0,
    velocitySensitivity: 0,
  },
  effects: {
    delay: {
      enabled: false,
      mode: 'sync',
      division: '1/8',
      timeSeconds: 0.25,
      feedback: 0.3,
      mix: 0.2,
    },
    reverb: {
      enabled: false,
      mix: 0.28,
      decaySeconds: 2.6,
      size: 0.65,
    },
  },
  wavetableData: createWavetableData(['sine']),
})

export const CALIBRATION_B_PATCH = createNextStage(
  CALIBRATION_A_PATCH,
  {
    name: 'Calibration B — Custom Wavetable',
    category: 'other',
    description:
      'Stage A with OSC1 changed from sine to the generated Air Spectrum wavetable at a fixed position.',
    tags: ['calibration', 'stage-b', 'osc1', 'wavetable'],
  },
  (patch) => {
    patch.oscillators[0].wavetableId = 'airy'
  },
)

export const CALIBRATION_C_PATCH = createNextStage(
  CALIBRATION_B_PATCH,
  {
    name: 'Calibration C — Amp Envelope',
    category: 'other',
    description: 'Stage B with a clearly audible attack, decay, sustain, and release envelope.',
    tags: ['calibration', 'stage-c', 'envelope', 'adsr'],
  },
  (patch) => {
    patch.ampEnvelope = {
      attackSeconds: 0.12,
      holdSeconds: 0,
      decaySeconds: 0.55,
      sustainLevel: 0.55,
      releaseSeconds: 0.8,
    }
  },
)

export const CALIBRATION_D_PATCH = createNextStage(
  CALIBRATION_C_PATCH,
  {
    name: 'Calibration D — Unison',
    category: 'other',
    description:
      'Stage C with deterministic five-voice OSC1 unison; random phase remains off for repeatable comparisons.',
    tags: ['calibration', 'stage-d', 'unison', 'stereo'],
  },
  (patch) => {
    patch.oscillators[0].unisonVoices = 5
    patch.oscillators[0].unisonDetune = 0.25
    patch.oscillators[0].stereoSpread = 0.8
  },
)

export const CALIBRATION_E_PATCH = createNextStage(
  CALIBRATION_D_PATCH,
  {
    name: 'Calibration E — Filter',
    category: 'other',
    description: 'Stage D with the configured 4.2 kHz resonant low-pass filter enabled.',
    tags: ['calibration', 'stage-e', 'filter', 'lowpass'],
  },
  (patch) => {
    patch.filter.enabled = true
  },
)

export const CALIBRATION_F_PATCH = createNextStage(
  CALIBRATION_E_PATCH,
  {
    name: 'Calibration F — LFO Gate',
    category: 'other',
    description:
      'Stage E with a tempo-synced LFO subtracting OSC1 level to create a repeatable eighth-note gate.',
    tags: ['calibration', 'stage-f', 'lfo', 'gate'],
  },
  (patch) => {
    patch.lfo1.enabled = true
    patch.modulations = [
      {
        id: 'calibration-lfo-gate',
        source: 'lfo1',
        destination: 'oscillator1.level',
        amount: -0.68,
        bipolar: false,
      },
    ]
  },
)

export const CALIBRATION_G_PATCH = createNextStage(
  CALIBRATION_F_PATCH,
  {
    name: 'Calibration G — OSC2',
    category: 'other',
    description: 'Stage F with a single-voice sine OSC2 enabled one octave above OSC1.',
    tags: ['calibration', 'stage-g', 'osc2', 'sine'],
  },
  (patch) => {
    patch.oscillators[1].enabled = true
  },
)

export const CALIBRATION_H_PATCH = createNextStage(
  CALIBRATION_G_PATCH,
  {
    name: 'Calibration H — Delay + Reverb',
    category: 'other',
    description: 'Stage G with moderate tempo-synced delay and algorithmic reverb enabled.',
    tags: ['calibration', 'stage-h', 'delay', 'reverb'],
  },
  (patch) => {
    patch.effects.delay.enabled = true
    patch.effects.reverb.enabled = true
  },
)

export const CALIBRATION_PRESET_ENTRIES: readonly CalibrationPresetEntry[] = [
  { id: 'calibration-a-osc1-sine', patch: CALIBRATION_A_PATCH },
  { id: 'calibration-b-custom-wavetable', patch: CALIBRATION_B_PATCH },
  { id: 'calibration-c-amp-envelope', patch: CALIBRATION_C_PATCH },
  { id: 'calibration-d-unison', patch: CALIBRATION_D_PATCH },
  { id: 'calibration-e-filter', patch: CALIBRATION_E_PATCH },
  { id: 'calibration-f-lfo-gate', patch: CALIBRATION_F_PATCH },
  { id: 'calibration-g-osc2', patch: CALIBRATION_G_PATCH },
  { id: 'calibration-h-delay-reverb', patch: CALIBRATION_H_PATCH },
]
