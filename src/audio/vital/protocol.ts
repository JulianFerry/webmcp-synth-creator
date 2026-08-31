import type { VitalControlOperation } from '../../vital/VitalPresetAdapter'

export const VITAL_WORKLET_PROTOCOL_VERSION = 2
export const VITAL_WORKLET_PROCESSOR_NAME = 'vital-wasm-processor'

export type VitalWorkletCommand =
  | { type: 'load-state'; revision: number; json: string }
  | { type: 'set-controls'; revision: number; operations: VitalControlOperation[] }
  | { type: 'set-bpm'; bpm: number }
  | { type: 'note-on'; note: number; velocity: number }
  | { type: 'note-off'; note: number }
  | { type: 'all-notes-off' }
  | { type: 'dispose' }

export type VitalWorkletEvent =
  | { type: 'ready'; sampleRate: number }
  | { type: 'state-applied'; revision: number; durationMs: number }
  | { type: 'controls-applied'; revision: number; durationMs: number }
  | { type: 'render-stats'; blockMs: number; overruns: number }
  | { type: 'error'; phase: string; message: string }

export function isVitalWorkletEvent(value: unknown): value is VitalWorkletEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false

  switch (value.type) {
    case 'ready':
      return isFiniteNumber(value.sampleRate) && value.sampleRate > 0
    case 'state-applied':
    case 'controls-applied':
      return (
        isNonNegativeSafeInteger(value.revision) &&
        isFiniteNumber(value.durationMs) &&
        value.durationMs >= 0
      )
    case 'render-stats':
      return (
        isFiniteNumber(value.blockMs) &&
        value.blockMs >= 0 &&
        isNonNegativeSafeInteger(value.overruns)
      )
    case 'error':
      return typeof value.phase === 'string' && typeof value.message === 'string'
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
