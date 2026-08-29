import type { LfoPoint } from '../../patch/types'

export const MIN_LFO_POINTS = 2
export const MAX_LFO_POINTS = 32
export const LFO_POINT_GAP = 0.001

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function moveLfoPoint(points: LfoPoint[], index: number, point: LfoPoint): LfoPoint[] {
  if (!points[index]) return points
  const minX = index === 0 ? 0 : points[index - 1].x + LFO_POINT_GAP
  const maxX = index === points.length - 1 ? 1 : points[index + 1].x - LFO_POINT_GAP
  return points.map((current, candidate) => candidate === index
    ? { ...current, x: clamp(point.x, minX, maxX), y: clamp(point.y, 0, 1) }
    : current)
}

export function insertLfoPoint(points: LfoPoint[], point: LfoPoint): LfoPoint[] {
  if (points.length >= MAX_LFO_POINTS) return points
  return [...points, { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }]
    .sort((left, right) => left.x - right.x)
}

export function deleteLfoPoint(points: LfoPoint[], index: number): LfoPoint[] {
  return points.length <= MIN_LFO_POINTS || !points[index] ? points : points.filter((_, candidate) => candidate !== index)
}
