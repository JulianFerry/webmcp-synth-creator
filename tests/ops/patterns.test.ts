import { describe, expect, it } from 'vitest'

import { GATE_PATTERNS } from '../../src/ops/patterns'
import { MOVEMENT_SHAPES } from '../../src/ops/shapes'

describe('operation LFO libraries', () => {
  it('contains the literal gate pattern point sets', () => {
    expect(GATE_PATTERNS).toEqual({
      even_8: points([1, 1, 0, 0, 1, 1, 0, 0, 1]),
      even_16: points([1, 0, 1, 0, 1, 0, 1, 0, 1]),
      offbeat: points([0, 0, 1, 1, 0, 0, 1, 1, 0]),
      long_short: points([1, 1, 1, 0, 1, 0, 0, 0, 1]),
      short_long: points([1, 0, 1, 1, 1, 0, 0, 0, 1]),
      triplet: points([1, 1, 0, 1, 1, 0, 1]),
      dotted: points([1, 1, 1, 0, 0, 0, 1, 0, 1]),
      swung: points([1, 1, 0, 0, 0, 1, 1, 0, 1]),
      stutter: points([1, 0, 1, 0, 1, 0, 0, 0, 1]),
      none: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
    })
  })

  it('contains the literal movement shape point sets', () => {
    expect(MOVEMENT_SHAPES).toEqual({
      sine: [{ x: 0, y: 0.5, power: 0.5 }, { x: 0.25, y: 1, power: -0.5 }, { x: 0.75, y: 0, power: 0.5 }, { x: 1, y: 0.5 }],
      triangle: [{ x: 0, y: 0.5 }, { x: 0.25, y: 1 }, { x: 0.75, y: 0 }, { x: 1, y: 0.5 }],
      ramp_up: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      ramp_down: [{ x: 0, y: 1 }, { x: 1, y: 0 }],
      random: [{ x: 0, y: 0.2 }, { x: 0.2, y: 0.85 }, { x: 0.4, y: 0.35 }, { x: 0.6, y: 1 }, { x: 0.8, y: 0.1 }, { x: 1, y: 0.65 }],
      smooth_random: [{ x: 0, y: 0.2, power: 0.5 }, { x: 0.2, y: 0.85, power: -0.5 }, { x: 0.4, y: 0.35, power: 0.5 }, { x: 0.6, y: 1, power: -0.5 }, { x: 0.8, y: 0.1, power: 0.5 }, { x: 1, y: 0.65 }],
    })
  })

  it.each([...Object.entries(GATE_PATTERNS), ...Object.entries(MOVEMENT_SHAPES)])('%s is a valid bounded, sorted full-cycle point set', (_name, points) => {
    expect(points.length).toBeGreaterThanOrEqual(2)
    expect(points.length).toBeLessThanOrEqual(32)
    expect(points[0].x).toBe(0)
    expect(points.at(-1)?.x).toBe(1)
    for (let index = 0; index < points.length; index += 1) {
      expect(points[index].x).toBeGreaterThanOrEqual(index === 0 ? 0 : points[index - 1].x)
      expect(points[index].x).toBeLessThanOrEqual(1)
      expect(points[index].y).toBeGreaterThanOrEqual(0)
      expect(points[index].y).toBeLessThanOrEqual(1)
    }
  })
})

function points(values: readonly number[]): Array<{ x: number; y: number }> {
  return values.map((y, index) => ({ x: index / (values.length - 1), y }))
}
