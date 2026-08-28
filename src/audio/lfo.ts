import type { EnvelopeState, LfoPoint, LfoRate, LfoState } from '../patch/types'
import type { TempoSyncDivision } from '../patch/limits'

export const DEFAULT_TEMPO_BPM = 120

const SYNC_DIVISION_BEATS = {
  '1/1': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 0.5,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
  '1/64': 0.0625,
} as const satisfies Record<TempoSyncDivision, number>

export function wrapPhase(phase: number): number {
  return ((phase % 1) + 1) % 1
}

export function syncDivisionSeconds(
  division: TempoSyncDivision,
  bpm = DEFAULT_TEMPO_BPM,
): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('Tempo must be positive')
  return SYNC_DIVISION_BEATS[division] * (60 / bpm)
}

export function lfoRateHz(rate: LfoRate, bpm = DEFAULT_TEMPO_BPM): number {
  return rate.mode === 'free' ? rate.hz : 1 / syncDivisionSeconds(rate.division, bpm)
}

function curvePosition(position: number, power: number, smooth: boolean): number {
  const clamped = Math.max(0, Math.min(1, position))
  const exponent = 2 ** (Math.abs(power) * 3)
  const powered = power >= 0 ? clamped ** exponent : 1 - (1 - clamped) ** exponent
  return smooth ? powered * powered * (3 - 2 * powered) : powered
}

export function evaluateLfoPoints(
  points: readonly LfoPoint[],
  phase: number,
  smooth = false,
): number {
  if (points.length < 2) throw new RangeError('An LFO requires at least two points')
  const wrapped = wrapPhase(phase)
  if (wrapped <= points[0].x) return points[0].y

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (wrapped > to.x) continue
    if (to.x === from.x) return to.y
    const position = (wrapped - from.x) / (to.x - from.x)
    const curved = curvePosition(position, from.power ?? 0, smooth)
    return from.y + (to.y - from.y) * curved
  }

  return points.at(-1)?.y ?? 0
}

export function evaluateLfo(
  lfo: LfoState,
  elapsedSeconds: number,
  bpm = DEFAULT_TEMPO_BPM,
): number {
  const phase = wrapPhase(lfo.phase + Math.max(0, elapsedSeconds) * lfoRateHz(lfo.rate, bpm))
  return evaluateLfoPoints(lfo.points, phase, lfo.smooth)
}

export interface EnvelopeReleaseState {
  elapsedSeconds: number
  startValue: number
}

export function evaluateEnvelope(
  envelope: EnvelopeState,
  elapsedSeconds: number,
  release?: EnvelopeReleaseState,
): number {
  const elapsed = Math.max(0, elapsedSeconds)
  if (release && elapsed >= release.elapsedSeconds) {
    if (envelope.releaseSeconds <= 0) return 0
    const releaseProgress = (elapsed - release.elapsedSeconds) / envelope.releaseSeconds
    return Math.max(0, release.startValue * (1 - releaseProgress))
  }

  if (envelope.attackSeconds > 0 && elapsed < envelope.attackSeconds) {
    return elapsed / envelope.attackSeconds
  }
  const afterAttack = elapsed - envelope.attackSeconds
  if (afterAttack < envelope.holdSeconds) return 1
  const afterHold = afterAttack - envelope.holdSeconds
  if (envelope.decaySeconds > 0 && afterHold < envelope.decaySeconds) {
    const decayProgress = afterHold / envelope.decaySeconds
    return 1 + (envelope.sustainLevel - 1) * decayProgress
  }
  return envelope.sustainLevel
}
