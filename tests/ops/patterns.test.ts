import { describe, expect, it } from 'vitest'

import { GATE_PATTERNS } from '../../src/ops/patterns'
import { MOVEMENT_SHAPES } from '../../src/ops/shapes'

describe('operation LFO libraries', () => {
  it.each([
    ['even_8', 8], ['even_16', 16], ['offbeat', 4], ['long_short', 4],
    ['short_long', 4], ['triplet', 3], ['dotted', 3], ['swung', 4], ['stutter', 5],
  ] as const)('%s contains the intended pulse count', (pattern, pulseCount) => {
    expect(GATE_PATTERNS[pattern].filter(({ y }) => y === 1)).toHaveLength(pulseCount)
  })

  it('uses the full point budget for sixteen near-vertical pulses', () => {
    expect(GATE_PATTERNS.even_16).toHaveLength(32)
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
