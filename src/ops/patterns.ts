import type { LfoPoint } from '../patch/types'
import { LFO_POINT_GAP } from '../patch/lfoPoints'
import type { GatePattern } from './types'

function pulses(starts: readonly number[]): LfoPoint[] {
  const points: LfoPoint[] = starts[0] === 0 ? [] : [{ x: 0, y: 0 }]
  starts.forEach((start, index) => {
    points.push(
      { x: start, y: 1 },
      { x: index === starts.length - 1 ? 1 : start + LFO_POINT_GAP, y: 0 },
    )
  })
  if (points.at(-1)?.x !== 1) points.push({ x: 1, y: 0 })
  return points
}

const subdivisions = (count: number): number[] => Array.from({ length: count }, (_, index) => index / count)
export const FLAT_GATE_PATTERN: readonly LfoPoint[] = [{ x: 0, y: 1 }, { x: 1, y: 1 }]

export const GATE_PATTERNS: Record<GatePattern, readonly LfoPoint[]> = {
  even_8: pulses(subdivisions(8)),
  even_16: pulses(subdivisions(16)),
  offbeat: pulses([1 / 8, 3 / 8, 5 / 8, 7 / 8]),
  long_short: pulses([0, 3 / 8, 1 / 2, 7 / 8]),
  short_long: pulses([0, 1 / 8, 1 / 2, 5 / 8]),
  triplet: pulses([0, 1 / 3, 2 / 3]),
  dotted: pulses([0, 3 / 8, 3 / 4]),
  swung: pulses([0, 1 / 3, 1 / 2, 5 / 6]),
  stutter: pulses([0, 1 / 16, 1 / 8, 3 / 16, 1 / 2]),
  none: FLAT_GATE_PATTERN,
}
