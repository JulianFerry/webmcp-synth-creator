import type { LfoPoint } from '../patch/types'
import type { GatePattern } from './types'

const pulse = (steps: readonly number[]): LfoPoint[] => steps.map((y, index) => ({ x: index / (steps.length - 1), y }))
export const FLAT_GATE_PATTERN: readonly LfoPoint[] = [{ x: 0, y: 1 }, { x: 1, y: 1 }]

export const GATE_PATTERNS: Record<GatePattern, readonly LfoPoint[]> = {
  even_8: pulse([1, 1, 0, 0, 1, 1, 0, 0, 1]),
  even_16: pulse([1, 0, 1, 0, 1, 0, 1, 0, 1]),
  offbeat: pulse([0, 0, 1, 1, 0, 0, 1, 1, 0]),
  long_short: pulse([1, 1, 1, 0, 1, 0, 0, 0, 1]),
  short_long: pulse([1, 0, 1, 1, 1, 0, 0, 0, 1]),
  triplet: pulse([1, 1, 0, 1, 1, 0, 1]),
  dotted: pulse([1, 1, 1, 0, 0, 0, 1, 0, 1]),
  swung: pulse([1, 1, 0, 0, 0, 1, 1, 0, 1]),
  stutter: pulse([1, 0, 1, 0, 1, 0, 0, 0, 1]),
  none: FLAT_GATE_PATTERN,
}
