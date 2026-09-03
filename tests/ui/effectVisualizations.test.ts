import { describe, expect, it } from 'vitest'

import type { CompressorState, DelayState, DistortionState, ReverbState } from '../../src/patch/types'
import {
  createCompressorPlot,
  createDelayPlot,
  createDistortionPlot,
  createReverbPlot,
} from '../../src/ui/modfx/effectVisualizations'

describe('effect visualizations', () => {
  it('positions delay taps from time and attenuates them from feedback', () => {
    const base: DelayState = { enabled: true, mode: 'free', timeSeconds: .2, feedback: .3, mix: .5 }
    const slower = createDelayPlot({ ...base, timeSeconds: 1.2 })
    const repeating = createDelayPlot({ ...base, feedback: .8 })
    const plot = createDelayPlot(base)

    expect(slower.taps[0].x).toBeGreaterThan(plot.taps[0].x)
    expect(repeating.taps[2].level).toBeGreaterThan(plot.taps[2].level)
    expect(plot.label).toBe('200 ms')
  })

  it('changes the reverb tail with predelay, decay, size, and mix', () => {
    const base: ReverbState = { enabled: true, mix: .35, decaySeconds: 2, size: .5, predelay: .02, lowCut: 0, highCut: 1 }
    const plot = createReverbPlot(base)

    expect(createReverbPlot({ ...base, predelay: .2 }).startX).toBeGreaterThan(plot.startX)
    expect(createReverbPlot({ ...base, decaySeconds: 7 }).path).not.toBe(plot.path)
    expect(createReverbPlot({ ...base, size: .9 }).path).not.toBe(plot.path)
    expect(createReverbPlot({ ...base, mix: .9 }).path).not.toBe(plot.path)
  })

  it('bends the compressor transfer curve with amount and wet mix', () => {
    const base: CompressorState = { enabled: true, bands: 'multiband', amount: .2, attack: .25, release: .7, mix: .5 }
    const plot = createCompressorPlot(base)

    expect(createCompressorPlot({ ...base, amount: .9 }).path).not.toBe(plot.path)
    expect(createCompressorPlot({ ...base, mix: 1 }).path).not.toBe(plot.path)
    expect(createCompressorPlot({ ...base, attack: .8 }).attackWidth).toBeGreaterThan(plot.attackWidth)
    expect(createCompressorPlot({ ...base, release: .1 }).releaseWidth).toBeLessThan(plot.releaseWidth)
    expect(createCompressorPlot({ ...base, mix: 0 }).maxGainReductionDb).toBeCloseTo(0)
    expect(createCompressorPlot({ ...base, amount: .9, mix: 1 }).maxGainReductionDb).toBeGreaterThan(plot.maxGainReductionDb)
  })

  it('draws distortion transfer functions from character, drive, and mix', () => {
    const base: DistortionState = { enabled: true, type: 'soft_clip', drive: .3, mix: .7 }
    const plot = createDistortionPlot(base)

    expect(createDistortionPlot({ ...base, type: 'hard_clip' }).path).not.toBe(plot.path)
    expect(createDistortionPlot({ ...base, drive: .9 }).path).not.toBe(plot.path)
    expect(createDistortionPlot({ ...base, mix: .2 }).path).not.toBe(plot.path)
  })
})
