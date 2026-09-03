import type { LfoPoint } from '../patch/types'
import type { MovementShape } from './types'

export const MOVEMENT_SHAPES: Record<MovementShape, readonly LfoPoint[]> = {
  sine: [{ x: 0, y: 0.5, power: 0.5 }, { x: 0.25, y: 1, power: -0.5 }, { x: 0.75, y: 0, power: 0.5 }, { x: 1, y: 0.5 }],
  triangle: [{ x: 0, y: 0.5 }, { x: 0.25, y: 1 }, { x: 0.75, y: 0 }, { x: 1, y: 0.5 }],
  ramp_up: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  ramp_down: [{ x: 0, y: 1 }, { x: 1, y: 0 }],
  random: [{ x: 0, y: 0.2 }, { x: 0.2, y: 0.85 }, { x: 0.4, y: 0.35 }, { x: 0.6, y: 1 }, { x: 0.8, y: 0.1 }, { x: 1, y: 0.65 }],
  smooth_random: [{ x: 0, y: 0.2, power: 0.5 }, { x: 0.2, y: 0.85, power: -0.5 }, { x: 0.4, y: 0.35, power: 0.5 }, { x: 0.6, y: 1, power: -0.5 }, { x: 0.8, y: 0.1, power: 0.5 }, { x: 1, y: 0.65 }],
}
