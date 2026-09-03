import type { EnvelopeState, LfoPoint, LfoRate, LfoState } from '../patch/types'
import { STRAIGHT_LFO_DIVISIONS, type TempoSyncDivision } from '../patch/limits'
import { vitalPowerScale } from './units'

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
  return 1 / syncDivisionSeconds(rate.division, bpm)
}

/** Maps legacy free-running rates using the workbench's fixed 120 BPM playback tempo. */
export function nearestStraightLfoDivision(
  hz: number,
  bpm = DEFAULT_TEMPO_BPM,
): (typeof STRAIGHT_LFO_DIVISIONS)[number] {
  const safeHz = Number.isFinite(hz) && hz > 0 ? hz : 1 / syncDivisionSeconds('1/4', bpm)
  return STRAIGHT_LFO_DIVISIONS.reduce((nearest, division) => {
    const distance = Math.abs(Math.log2(safeHz / lfoRateHz({ mode: 'sync', division }, bpm)))
    const nearestDistance = Math.abs(Math.log2(safeHz / lfoRateHz({ mode: 'sync', division: nearest }, bpm)))
    return distance < nearestDistance ? division : nearest
  })
}

function curvePosition(position: number, power: number, smooth: boolean): number {
  const clamped = Math.max(0, Math.min(1, position))
  // These are the two transforms used by Vital's LineGenerator for the same
  // serialized `power` and `smooth` fields.
  const smoothed = smooth ? 0.5 * Math.sin((clamped - 0.5) * Math.PI) + 0.5 : clamped
  return vitalPowerScale(smoothed, power)
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
  const phase = lfoPhaseAtTime(lfo, elapsedSeconds, bpm)
  return evaluateLfoPoints(lfo.points, phase, lfo.smooth)
}

export function lfoPhaseAtTime(
  lfo: Pick<LfoState, 'phase' | 'rate'>,
  elapsedSeconds: number,
  bpm = DEFAULT_TEMPO_BPM,
): number {
  return wrapPhase(lfo.phase + Math.max(0, elapsedSeconds) * lfoRateHz(lfo.rate, bpm))
}

export function evaluateLfoCycle(
  lfo: Pick<LfoState, 'phase' | 'rate'>,
  elapsedSeconds: number,
  bpm = DEFAULT_TEMPO_BPM,
): { phase: number; visitedStartPhase: number } {
  const startPhase = wrapPhase(lfo.phase)
  const unwrappedPhase = startPhase + Math.max(0, elapsedSeconds) * lfoRateHz(lfo.rate, bpm)
  return {
    phase: wrapPhase(unwrappedPhase),
    visitedStartPhase: unwrappedPhase < 1 ? startPhase : 0,
  }
}

export interface EnvelopeReleaseState {
  elapsedSeconds: number
  startValue: number
}

export function envelopeCurvePosition(progress: number, curve: number): number {
  return vitalPowerScale(progress, curve * 20)
}

export function envelopeCurveFromMidpoint(midpoint: number): number {
  const clamped = Math.max(0, Math.min(1, midpoint))
  const minimum = envelopeCurvePosition(0.5, 1)
  const maximum = envelopeCurvePosition(0.5, -1)
  if (clamped <= minimum) return 1
  if (clamped >= maximum) return -1
  if (Math.abs(clamped - 0.5) < Number.EPSILON) return 0

  const curve = Math.log((1 - clamped) / clamped) / 10
  return Math.abs(curve * 20) < 0.01 ? 0 : Math.max(-1, Math.min(1, curve))
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
    return Math.max(
      0,
      release.startValue * (1 - envelopeCurvePosition(releaseProgress, envelope.releaseCurve)),
    )
  }

  if (elapsed < envelope.delaySeconds) return 0
  const afterDelay = elapsed - envelope.delaySeconds

  if (envelope.attackSeconds > 0 && afterDelay < envelope.attackSeconds) {
    return envelopeCurvePosition(afterDelay / envelope.attackSeconds, envelope.attackCurve)
  }
  const afterAttack = afterDelay - envelope.attackSeconds
  if (afterAttack < envelope.holdSeconds) return 1
  const afterHold = afterAttack - envelope.holdSeconds
  if (envelope.decaySeconds > 0 && afterHold < envelope.decaySeconds) {
    const decayProgress = afterHold / envelope.decaySeconds
    return 1 +
      (envelope.sustainLevel - 1) * envelopeCurvePosition(decayProgress, envelope.decayCurve)
  }
  return envelope.sustainLevel
}
