import type { SupportedPatchPath } from '../patch/paths'
import type { PatchState } from '../patch/types'
import type { AudioPreviewValues } from './preview'
import type { AudioPatchReflection, OscillatorReflection } from './reflection'

export type SynthRendererLifecycle = 'suspended' | 'running' | 'unavailable' | 'error'

export const AUDITION_HELD_MIDI_NOTE = 48

export interface NoteOnTimingMeasurement {
  midi: number
  velocity: number
  requestedAtMs: number
  audioReadyMs: number
  voiceGraphBuildMs: number
  inputToVoiceReadyMs: number
  scheduledContextTimeSeconds: number
  baseLatencyMs: number | null
  outputLatencyMs: number | null
  renderQuantumMs: number
  attackMs: number
  estimateSource: 'output-timestamp' | 'latency-properties' | 'app-only'
  estimatedFirstSampleMs: number
  estimatedEnvelopeMinus40DbMs: number
  estimatedEnvelopeMinus20DbMs: number
}

export interface SynthRendererState {
  lifecycle: SynthRendererLifecycle
  held: boolean
  activeVoiceCount: number
  activeNotes: number[]
  polyphony: number
  stolenVoiceCount: number
  cutoffHz: number
  wavetablePosition: number
  previewWavetablePositions: [number | null, number | null, number | null]
  oscillators: [OscillatorReflection, OscillatorReflection, OscillatorReflection]
  draft: AudioPatchReflection
  effective: AudioPatchReflection
  previewValues: AudioPreviewValues
  modulationScheduleVersion: number
  effects: PatchState['effects']
  reflectedPatchName: string
  lastNoteOnTiming: NoteOnTimingMeasurement | null
}

export interface SynthRenderer {
  getState(): SynthRendererState
  subscribe(listener: (state: SynthRendererState) => void): () => void
  prepare(): Promise<void>
  startAudio(): Promise<void>
  noteOn(midi: number, velocity?: number, requestedAtMs?: number): Promise<void>
  noteOff(midi: number): void
  releaseAllNotes(): void
  toggleHeldNote(requestedAtMs?: number): Promise<SynthRendererState>
  previewPatchChange(path: SupportedPatchPath, value: unknown): boolean
  cancelPatchPreview(path: SupportedPatchPath): void
  cancelAllPatchPreviews(): void
  dispose(): void
}
