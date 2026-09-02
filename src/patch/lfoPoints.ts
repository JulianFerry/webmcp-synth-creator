import { vitalPowerScale } from '../audio/units'
import type { LfoPoint } from './types'

export const MIN_LFO_POINTS = 2
export const MAX_LFO_POINTS = 32
export const LFO_POINT_GAP = 0.001

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function moveLfoPoint(points: LfoPoint[], index: number, point: LfoPoint): LfoPoint[] {
  if (!points[index]) return points
  const endpointX = index === 0 ? 0 : index === points.length - 1 ? 1 : undefined
  const minX = endpointX ?? points[index - 1].x + LFO_POINT_GAP
  const maxX = endpointX ?? points[index + 1].x - LFO_POINT_GAP
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

export function setLfoCurvePower(points: LfoPoint[], index: number, power: number): LfoPoint[] {
  if (!points[index] || !points[index + 1]) return points
  return points.map((point, candidate) => candidate === index
    ? { ...point, power: clamp(power, -1, 1) }
    : point)
}

export function moveLfoCurvePoint(points: LfoPoint[], index: number, targetY: number): LfoPoint[] {
  const from = points[index]
  const to = points[index + 1]
  if (!from || !to || Math.abs(to.y - from.y) < 0.0001) return points
  const curvePosition = clamp((clamp(targetY, 0, 1) - from.y) / (to.y - from.y), 0, 1)
  let lower = -1
  let upper = 1
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const candidate = (lower + upper) / 2
    if (vitalPowerScale(0.5, candidate) > curvePosition) lower = candidate
    else upper = candidate
  }
  return setLfoCurvePower(points, index, (lower + upper) / 2)
}
