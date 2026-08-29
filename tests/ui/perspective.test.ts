import { describe, expect, it } from 'vitest'

import { depthShade, projectIsometricPoint } from '../../src/ui/visualizations/perspective'

describe('isometric projection', () => {
  const viewport = { width: 320, height: 180, padding: 10 }

  it('moves frequency left-to-right and time down-and-right', () => {
    const origin = projectIsometricPoint(0, 0, 0.5, 16, 8, viewport)
    const frequency = projectIsometricPoint(15, 0, 0.5, 16, 8, viewport)
    const depth = projectIsometricPoint(0, 7, 0.5, 16, 8, viewport)
    expect(frequency.x).toBeGreaterThan(origin.x)
    expect(depth.x).toBeGreaterThan(origin.x)
    expect(depth.y).toBeGreaterThan(origin.y)
  })

  it('fits all extrema inside the viewport', () => {
    for (const column of [0, 15]) for (const depth of [0, 7]) for (const value of [0, 1]) {
      const point = projectIsometricPoint(column, depth, value, 16, 8, viewport)
      expect(point.x).toBeGreaterThanOrEqual(10)
      expect(point.x).toBeLessThanOrEqual(310)
      expect(point.y).toBeGreaterThanOrEqual(10)
      expect(point.y).toBeLessThanOrEqual(170)
    }
  })

  it('orders depth shading from back to front', () => {
    expect(depthShade(0, 8)).toBeLessThan(depthShade(7, 8))
    expect(depthShade(0, 1)).toBe(1)
  })
})
