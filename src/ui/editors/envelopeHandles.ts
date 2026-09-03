import type { EnvelopeState } from '../../patch/types'
import { envelopeCurveFromMidpoint, envelopeCurvePosition } from '../../audio/lfo'
import { createEnvelopePlot } from '../visualizations'

export type EnvelopeHandle = 'delay' | 'attack' | 'hold' | 'decay' | 'sustain' | 'release' | 'attackCurve' | 'decayCurve' | 'releaseCurve'

export const ENVELOPE_HANDLE_FIELDS = {
  delay: 'delaySeconds',
  attack: 'attackSeconds',
  hold: 'holdSeconds',
  decay: 'decaySeconds',
  sustain: 'sustainLevel',
  release: 'releaseSeconds',
  attackCurve: 'attackCurve',
  decayCurve: 'decayCurve',
  releaseCurve: 'releaseCurve',
} as const

const MAXIMUMS = { delay: 4, attack: 3, hold: 4, decay: 5, sustain: 1, release: 8 } as const
type TimeHandle = keyof typeof MAXIMUMS

function isCurveHandle(handle: EnvelopeHandle): handle is 'attackCurve' | 'decayCurve' | 'releaseCurve' {
  return handle === 'attackCurve' || handle === 'decayCurve' || handle === 'releaseCurve'
}

export function envelopeHandlePoints(
  envelope: EnvelopeState,
  options?: { includeDelayPhase?: boolean },
): Record<EnvelopeHandle, { x: number; y: number }> {
  const plot = createEnvelopePlot(envelope, options)
  const curvePoint = (startX: number, endX: number, startY: number, endY: number, curve: number) => ({
    x: (startX + endX) / 2,
    y: startY + (endY - startY) * envelopeCurvePosition(0.5, curve),
  })
  return {
    delay: { x: plot.delayEndX, y: 29 },
    attack: { x: plot.attackEndX, y: 3 },
    hold: { x: plot.holdEndX, y: 3 },
    decay: { x: plot.decayEndX, y: plot.sustainY },
    sustain: { x: plot.releaseStartX, y: plot.sustainY },
    release: { x: plot.releaseEndX, y: 29 },
    attackCurve: curvePoint(plot.delayEndX, plot.attackEndX, 29, 3, envelope.attackCurve),
    decayCurve: curvePoint(plot.holdEndX, plot.decayEndX, 3, plot.sustainY, envelope.decayCurve),
    releaseCurve: curvePoint(plot.releaseStartX, plot.releaseEndX, plot.sustainY, 29, envelope.releaseCurve),
  }
}

export function envelopeValueFromPoint(
  handle: EnvelopeHandle,
  x: number,
  y: number,
  envelope: EnvelopeState,
  options?: { includeDelayPhase?: boolean },
): number {
  const points = envelopeHandlePoints(envelope, options)
  if (isCurveHandle(handle)) {
    const plot = createEnvelopePlot(envelope, options)
    const [startY, endY] = handle === 'attackCurve'
      ? [29, 3]
      : handle === 'decayCurve'
        ? [3, plot.sustainY]
        : [plot.sustainY, 29]
    if (Math.abs(endY - startY) < 1e-6) return envelope[ENVELOPE_HANDLE_FIELDS[handle]]
    const target = clamp((y - startY) / (endY - startY), 0, 1)
    return envelopeCurveFromMidpoint(target)
  }
  if (handle === 'sustain') return clamp((29 - y) / 26, 0, 1)
  if (handle === 'release') return inverseWidth(x - createEnvelopePlot(envelope, options).releaseStartX, MAXIMUMS.release)
  const origin = handle === 'delay' ? 4 : handle === 'attack' ? points.delay.x : handle === 'hold' ? points.attack.x : points.hold.x
  return inverseWidth(x - origin, MAXIMUMS[handle])
}

export function nudgeEnvelopeValue(handle: EnvelopeHandle, value: number, direction: number): number {
  if (isCurveHandle(handle)) return clamp(value + direction * 0.05, -1, 1)
  return clamp(value + direction * 0.01, 0, MAXIMUMS[handle as TimeHandle])
}

export function hitTestEnvelopeHandle(envelope: EnvelopeState, x: number, y: number, radius = 5): EnvelopeHandle | null {
  const points = envelopeHandlePoints(envelope)
  return (Object.keys(points) as EnvelopeHandle[]).find((handle) => Math.hypot(points[handle].x - x, points[handle].y - y) <= radius) ?? null
}

function inverseWidth(width: number, maximum: number): number {
  const normalizedWidth = clamp((width - 4) / 14, 0, 1)
  return normalizedWidth ** 2 * maximum
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
