import { describe, expect, it } from 'vitest'

import type { WavetableState } from '../../src/patch/types'
import {
  projectWavetableWaterfall,
  WAVETABLE_DEPTH_ROTATION_RATIO,
  WAVETABLE_FREQUENCY_TILT_RATIO,
  WAVETABLE_HEIGHT_RATIO,
} from '../../src/ui/visualizations/wavetableWaterfall'

const morphing: WavetableState = { id: 'morph', name: 'Morph', frames: [{ harmonics: [1] }, { harmonics: [0, 1] }, { harmonics: [0, 0, 1] }] }

describe('wavetable waterfall projection', () => {
  it('projects a dense interpolated table and selected waveform inside the viewport', () => {
    const result = projectWavetableWaterfall(morphing, 0.5, { width: 240, height: 120 }, 16)
    expect(result.lines).toHaveLength(64)
    expect(result.lines.every((line) => line.length === 16)).toBe(true)
    expect(result.lines.flat().every(({ x, y }) => x >= 0 && x <= 240 && y >= 0 && y <= 120)).toBe(true)
    expect(result.selectedLine).toBe(result.lines[result.marker.line])
    expect(result.marker.frame).toBe(1)
    expect(result.plotBounds.left).toBeCloseTo(4.8)
    expect(result.plotBounds.right).toBeCloseTo(235.2)
    expect(result.plotBounds.width).toBeCloseTo(230.4)
    const projectedXs = result.lines.flat().map(({ x }) => x)
    expect(Math.min(...projectedXs)).toBeCloseTo(result.plotBounds.left)
    expect(Math.max(...projectedXs)).toBeCloseTo(result.plotBounds.right)
  })

  it('pins a single-frame table and marker to frame zero', () => {
    const result = projectWavetableWaterfall({ ...morphing, frames: [morphing.frames[0]] }, 0.9, { width: 120, height: 80 }, 8)
    expect(result.lines).toHaveLength(64)
    expect(result.marker.frame).toBe(0)
  })

  it('clamps the position marker to the available frame range', () => {
    expect(projectWavetableWaterfall(morphing, -1, { width: 100, height: 60 }).marker.frame).toBe(0)
    expect(projectWavetableWaterfall(morphing, 2, { width: 100, height: 60 }).marker.frame).toBe(2)
  })

  it('projects depth diagonally right for oscillator 3D mode', () => {
    const result = projectWavetableWaterfall(morphing, 0.5, { width: 240, height: 120 }, 16, 8, 'right')
    expect(result.lines[0][0].x).toBeLessThan(result.lines.at(-1)![0].x)
  })

  it('adds frequency tilt, stronger depth rotation, and taller waveforms', () => {
    const viewport = { width: 240, height: 120 }
    const result = projectWavetableWaterfall(morphing, 0.5, viewport, 32, 8, 'right')
    const line = result.lines[3]
    const yRange = Math.max(...line.map(({ y }) => y)) - Math.min(...line.map(({ y }) => y))

    expect(WAVETABLE_DEPTH_ROTATION_RATIO).toBe(0.14)
    expect(WAVETABLE_FREQUENCY_TILT_RATIO).toBe(0.055)
    expect(WAVETABLE_HEIGHT_RATIO).toBe(0.11)
    expect(line.at(-1)!.y).not.toBeCloseTo(line[0].y)
    expect(yRange).toBeGreaterThan(viewport.height * 0.1)
  })
})
