import type { EnvelopeState } from '../../patch/types'
import { createEnvelopePlot } from '../visualizations'

export type EnvelopeHandle = 'attack' | 'decay' | 'sustain' | 'release'

export const ENVELOPE_HANDLE_FIELDS = {
  attack: 'attackSeconds',
  decay: 'decaySeconds',
  sustain: 'sustainLevel',
  release: 'releaseSeconds',
} as const

const MAXIMUMS: Record<EnvelopeHandle, number> = { attack: 3, decay: 5, sustain: 1, release: 8 }

export function envelopeHandlePoints(envelope: EnvelopeState): Record<EnvelopeHandle, { x: number; y: number }> {
  const plot = createEnvelopePlot(envelope)
  return {
    attack: { x: plot.attackEndX, y: 7 },
    decay: { x: plot.decayEndX, y: plot.sustainY },
    sustain: { x: plot.releaseStartX, y: plot.sustainY },
    release: { x: 98, y: 64 },
  }
}

export function envelopeValueFromPoint(handle: EnvelopeHandle, x: number, y: number, envelope: EnvelopeState): number {
  const points = envelopeHandlePoints(envelope)
  if (handle === 'sustain') return clamp((64 - y) / 57, 0, 1)
  if (handle === 'release') return inverseWidth(98 - x, MAXIMUMS.release)
  const origin = handle === 'attack' ? 2 : points.attack.x
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
  return clamp(((width - 6) / 18) ** 2 * maximum, 0, maximum)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
