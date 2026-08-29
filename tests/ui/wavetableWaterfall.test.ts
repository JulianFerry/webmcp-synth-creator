import { describe, expect, it } from 'vitest'

import type { WavetableState } from '../../src/patch/types'
import { projectWavetableWaterfall } from '../../src/ui/visualizations/wavetableWaterfall'

const morphing: WavetableState = { id: 'morph', name: 'Morph', frames: [{ harmonics: [1] }, { harmonics: [0, 1] }, { harmonics: [0, 0, 1] }] }

describe('wavetable waterfall projection', () => {
  it('projects every frame and sample inside the viewport', () => {
    const result = projectWavetableWaterfall(morphing, 0.5, { width: 240, height: 120 }, 16)
    expect(result.lines).toHaveLength(3)
    expect(result.lines.every((line) => line.length === 16)).toBe(true)
    expect(result.lines.flat().every(({ x, y }) => x >= 0 && x <= 240 && y >= 0 && y <= 120)).toBe(true)
    expect(result.marker.frame).toBe(1)
  })

  it('pins a single-frame table and marker to frame zero', () => {
    const result = projectWavetableWaterfall({ ...morphing, frames: [morphing.frames[0]] }, 0.9, { width: 120, height: 80 }, 8)
    expect(result.lines).toHaveLength(1)
    expect(result.marker.frame).toBe(0)
  })

  it('clamps the position marker to the available frame range', () => {
    expect(projectWavetableWaterfall(morphing, -1, { width: 100, height: 60 }).marker.frame).toBe(0)
    expect(projectWavetableWaterfall(morphing, 2, { width: 100, height: 60 }).marker.frame).toBe(2)
  })
})
