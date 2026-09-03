import {
  FILTER_CUTOFF_MAX_HZ,
  FILTER_CUTOFF_MIN_HZ,
  REVERB_DECAY_MAX_SECONDS,
  REVERB_DECAY_MIN_SECONDS,
  TEMPO_SYNC_DIVISIONS,
  type TempoSyncDivision,
} from '../patch/limits'
import type { EnvelopeState } from '../patch/types'

const CUTOFF_MIN_MIDI_NOTE = 8
const CUTOFF_MAX_MIDI_NOTE = 136
const LFO_MIN_HZ = 0.01
const LFO_MAX_HZ = 40
const GLIDE_MAX_SECONDS = 5
const GLIDE_MIN_EXPONENT = -10

function assertNormalized(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`)
  }
}

function assertRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`)
  }
}

function normalizedToLogRange(value: number, minimum: number, maximum: number): number {
  return minimum * (maximum / minimum) ** value
}

function logRangeToNormalized(value: number, minimum: number, maximum: number): number {
  return Math.log(value / minimum) / Math.log(maximum / minimum)
}

export function normalizedToCutoffHz(normalized: number): number {
  assertNormalized(normalized, 'Normalized cutoff')
  const note = CUTOFF_MIN_MIDI_NOTE + normalized * (CUTOFF_MAX_MIDI_NOTE - CUTOFF_MIN_MIDI_NOTE)
  const hz = Math.round(440 * 2 ** ((note - 69) / 12))
  return Math.min(FILTER_CUTOFF_MAX_HZ, Math.max(FILTER_CUTOFF_MIN_HZ, hz))
}

export function cutoffHzToNormalized(hz: number): number {
  assertRange(hz, FILTER_CUTOFF_MIN_HZ, FILTER_CUTOFF_MAX_HZ, 'Filter cutoff')
  if (hz === FILTER_CUTOFF_MIN_HZ) return 0
  if (hz === FILTER_CUTOFF_MAX_HZ) return 1
  const note = 69 + 12 * Math.log2(hz / 440)
  return Math.min(1, Math.max(0, (note - CUTOFF_MIN_MIDI_NOTE) / (CUTOFF_MAX_MIDI_NOTE - CUTOFF_MIN_MIDI_NOTE)))
}

export function normalizedToReverbDecaySeconds(normalized: number): number {
  assertNormalized(normalized, 'Normalized reverb decay')
  return normalizedToLogRange(normalized, REVERB_DECAY_MIN_SECONDS, REVERB_DECAY_MAX_SECONDS)
}

export function reverbDecaySecondsToNormalized(seconds: number): number {
  assertRange(seconds, REVERB_DECAY_MIN_SECONDS, REVERB_DECAY_MAX_SECONDS, 'Reverb decay')
  return logRangeToNormalized(seconds, REVERB_DECAY_MIN_SECONDS, REVERB_DECAY_MAX_SECONDS)
}

export function normalizedToGlideSeconds(normalized: number): number {
  assertNormalized(normalized, 'Normalized glide')
  if (normalized === 0) return 0
  const exponent = GLIDE_MIN_EXPONENT + normalized * (Math.log2(GLIDE_MAX_SECONDS) - GLIDE_MIN_EXPONENT)
  return 2 ** exponent
}

export function glideSecondsToNormalized(seconds: number): number {
  assertRange(seconds, 0, GLIDE_MAX_SECONDS, 'Glide time')
  if (seconds === 0) return 0
  const normalized = (Math.log2(seconds) - GLIDE_MIN_EXPONENT) / (Math.log2(GLIDE_MAX_SECONDS) - GLIDE_MIN_EXPONENT)
  return Math.min(1, Math.max(0, normalized))
}

export function normalizedToLfoDivision(normalized: number): TempoSyncDivision {
  assertNormalized(normalized, 'Normalized LFO rate')
  const index = Math.round(normalized * (TEMPO_SYNC_DIVISIONS.length - 1))
  return TEMPO_SYNC_DIVISIONS[index]
}

export function lfoDivisionToNormalized(division: TempoSyncDivision): number {
  const index = TEMPO_SYNC_DIVISIONS.indexOf(division)
  if (index < 0) throw new RangeError(`Unsupported LFO division: ${division}`)
  return index / (TEMPO_SYNC_DIVISIONS.length - 1)
}

export function normalizedToLfoHz(normalized: number): number {
  assertNormalized(normalized, 'Normalized LFO rate')
  return normalizedToLogRange(normalized, LFO_MIN_HZ, LFO_MAX_HZ)
}

export function lfoHzToNormalized(hz: number): number {
  assertRange(hz, LFO_MIN_HZ, LFO_MAX_HZ, 'LFO frequency')
  return logRangeToNormalized(hz, LFO_MIN_HZ, LFO_MAX_HZ)
}

export function scaleEnvelopeTimes(env: EnvelopeState, speed: number): EnvelopeState {
  assertNormalized(speed, 'Envelope speed')
  const scale = 0.25 + speed * 1.5
  return {
    ...env,
    delaySeconds: env.delaySeconds * scale,
    attackSeconds: env.attackSeconds * scale,
    holdSeconds: env.holdSeconds * scale,
    decaySeconds: env.decaySeconds * scale,
    releaseSeconds: env.releaseSeconds * scale,
  }
}
