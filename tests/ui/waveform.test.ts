import { describe, expect, it } from 'vitest'

import { buildMinMaxWaveformPath, downsampleWaveform } from '../../src/ui/visualizations/waveform'

describe('processed waveform derivation', () => {
  it('preserves minimum and maximum values in deterministic buckets', () => {
    expect(downsampleWaveform(new Float32Array([-1, -0.5, 0.25, 1]), 2)).toEqual([
      { minimum: -1, maximum: -0.5 },
      { minimum: 0.25, maximum: 1 },
    ])
  })

  it('keeps generated path coordinates inside the viewport', () => {
    const path = buildMinMaxWaveformPath(new Float32Array([-2, -0.5, 0.5, 2]), 100, 48, 4)
    const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value))
    expect(path).not.toBe('')
    expect(numbers.every((value) => value >= 0 && value <= 100)).toBe(true)
    expect(path).toBe(buildMinMaxWaveformPath(new Float32Array([-2, -0.5, 0.5, 2]), 100, 48, 4))
  })

  it('handles empty buffers and invalid bucket counts', () => {
    expect(downsampleWaveform(new Float32Array(), 20)).toEqual([])
    expect(buildMinMaxWaveformPath(new Float32Array())).toBe('')
    expect(downsampleWaveform(new Float32Array([1]), 0)).toEqual([])
  })
})
