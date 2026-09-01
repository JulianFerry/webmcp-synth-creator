import { describe, expect, it } from 'vitest'
import { deleteLfoPoint, insertLfoPoint, MAX_LFO_POINTS, moveLfoCurvePoint, moveLfoPoint, setLfoCurvePower } from '../../src/ui/editors/lfoPoints'

describe('LFO point editing', () => {
  const points = [{ x: 0, y: 0 }, { x: .5, y: 1 }, { x: 1, y: 0 }]

  it('constrains moved points between their neighbors', () => {
    const moved = moveLfoPoint(points, 1, { x: 2, y: -1 })
    expect(moved[1].x).toBeLessThan(points[2].x)
    expect(moved[1].y).toBe(0)
  })

  it('inserts in x order and preserves the two point minimum', () => {
    expect(insertLfoPoint(points, { x: .25, y: .4 }).map((point) => point.x)).toEqual([0, .25, .5, 1])
    expect(deleteLfoPoint(points.slice(0, 2), 0)).toHaveLength(2)
  })

  it('enforces the maximum point count', () => {
    const full = Array.from({ length: MAX_LFO_POINTS }, (_, index) => ({ x: index / (MAX_LFO_POINTS - 1), y: 0 }))
    expect(insertLfoPoint(full, { x: .2, y: 1 })).toBe(full)
  })

  it('keeps curve power on the leading position point', () => {
    const powered = setLfoCurvePower(points, 0, .4)
    expect(powered[0].power).toBe(.4)
    expect(powered[1].power).toBeUndefined()
    const curved = moveLfoCurvePoint(points, 0, .75)
    expect(curved[0].power).toBeLessThan(0)
    expect(moveLfoCurvePoint(points, points.length - 1, .5)).toBe(points)
  })
})
