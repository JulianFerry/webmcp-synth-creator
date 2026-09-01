import type { EnvelopeState } from '../../patch/types'
import { createEnvelopePlot } from '../visualizations'

export type EnvelopeHandle = 'attack' | 'hold' | 'decay' | 'sustain' | 'release'

export const ENVELOPE_HANDLE_FIELDS = {
  attack: 'attackSeconds',
  hold: 'holdSeconds',
  decay: 'decaySeconds',
  sustain: 'sustainLevel',
  release: 'releaseSeconds',
} as const

const MAXIMUMS: Record<EnvelopeHandle, number> = { attack: 3, hold: 4, decay: 5, sustain: 1, release: 8 }

export function envelopeHandlePoints(envelope: EnvelopeState): Record<EnvelopeHandle, { x: number; y: number }> {
  const plot = createEnvelopePlot(envelope)
  return {
    attack: { x: plot.attackEndX, y: 3 },
    hold: { x: plot.holdEndX, y: 3 },
    decay: { x: plot.decayEndX, y: plot.sustainY },
    sustain: { x: plot.decayEndX, y: plot.sustainY },
    release: { x: plot.releaseEndX, y: 29 },
  }
}

export function envelopeValueFromPoint(handle: EnvelopeHandle, x: number, y: number, envelope: EnvelopeState): number {
  const points = envelopeHandlePoints(envelope)
  if (handle === 'sustain') return clamp((29 - y) / 26, 0, 1)
  if (handle === 'release') return inverseWidth(x - createEnvelopePlot(envelope).releaseStartX, MAXIMUMS.release)
  const origin = handle === 'attack' ? 4 : handle === 'hold' ? points.attack.x : points.hold.x
  return inverseWidth(x - origin, MAXIMUMS[handle])
}

export function nudgeEnvelopeValue(handle: EnvelopeHandle, value: number, direction: number): number {
  const step = handle === 'sustain' ? 0.01 : 0.01
  return clamp(value + direction * step, 0, MAXIMUMS[handle])
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
