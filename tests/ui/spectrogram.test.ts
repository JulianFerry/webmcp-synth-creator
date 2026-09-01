import { describe, expect, it } from 'vitest'

import { buildSpectrogramGrid } from '../../src/ui/visualizations/spectrogram'

describe('spectrogram derivation', () => {
  it('bounds windows and bins and normalizes magnitudes', () => {
    const samples = Float32Array.from({ length: 8_192 }, (_, index) => Math.sin(index * 0.1))
    const grid = buildSpectrogramGrid(samples, 48_000, { maxBins: 24, maxWindows: 5, windowSize: 256 })
    expect(grid.windows).toBe(5)
    expect(grid.bins).toBe(24)
    expect(grid.magnitudes).toHaveLength(120)
    expect([...grid.magnitudes].every((value) => value >= 0 && value <= 1)).toBe(true)
    expect(grid.maxFrequencyHz).toBe(16_000)
  })

  it('is deterministic and distinguishes frequency content', () => {
    const low = Float32Array.from({ length: 2_048 }, (_, index) => Math.sin(index * 0.03))
    const high = Float32Array.from({ length: 2_048 }, (_, index) => Math.sin(index * 0.7))
    const first = buildSpectrogramGrid(low, 48_000, { windowSize: 256 })
    expect(first.magnitudes).toEqual(buildSpectrogramGrid(low, 48_000, { windowSize: 256 }).magnitudes)
    expect(first.magnitudes).not.toEqual(buildSpectrogramGrid(high, 48_000, { windowSize: 256 }).magnitudes)
  })

  it('returns zero magnitudes for silence and an empty grid for no samples', () => {
    const silent = buildSpectrogramGrid(new Float32Array(512), 44_100, { windowSize: 256 })
    expect([...silent.magnitudes].every((value) => value === 0)).toBe(true)
    expect(buildSpectrogramGrid(new Float32Array(), 44_100)).toMatchObject({ windows: 0, bins: 0 })
  })
})
