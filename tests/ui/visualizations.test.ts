import { describe, expect, it } from 'vitest'

import type { EnvelopeState, FilterState, FilterType } from '../../src/patch/types'
import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../../src/patch/limits'
import { WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE } from '../../src/ui/controls/parameterScale'
import {
  createEnvelopePlot,
  createFilterResponsePlot,
  normalizedFilterCutoff,
} from '../../src/ui/visualizations'

const envelope: EnvelopeState = {
  delaySeconds: 0,
  attackSeconds: 0.2,
  holdSeconds: 0,
  decaySeconds: 0.8,
  sustainLevel: 0.7,
  releaseSeconds: 1.2,
  attackCurve: 0,
  decayCurve: 0,
  releaseCurve: 0,
}

describe('ADSR visualization', () => {
  it('gives attack, hold, decay/sustain, and release independent visible geometry', () => {
    const base = createEnvelopePlot(envelope)
    const attack = createEnvelopePlot({ ...envelope, attackSeconds: 2.5 })
    const hold = createEnvelopePlot({ ...envelope, holdSeconds: 3 })
    const decay = createEnvelopePlot({ ...envelope, decaySeconds: 4 })
    const sustain = createEnvelopePlot({ ...envelope, sustainLevel: 0.2 })
    const release = createEnvelopePlot({ ...envelope, releaseSeconds: 7 })
    const delay = createEnvelopePlot({ ...envelope, delaySeconds: 2 })
    const curved = createEnvelopePlot({ ...envelope, attackCurve: .6, decayCurve: -.6, releaseCurve: .4 })

    expect(attack.attackEndX).toBeGreaterThan(base.attackEndX)
    expect(delay.delayEndX).toBeGreaterThan(base.delayEndX)
    expect(hold.holdEndX - hold.attackEndX).toBeGreaterThan(
      base.holdEndX - base.attackEndX,
    )
    expect(decay.decayEndX - decay.attackEndX).toBeGreaterThan(
      base.decayEndX - base.attackEndX,
    )
    expect(sustain.sustainY).toBeGreaterThan(base.sustainY)
    expect(release.releaseStartX).toBe(base.releaseStartX)
    expect(release.releaseEndX).toBeGreaterThan(base.releaseEndX)
    expect(new Set([base.path, attack.path, hold.path, decay.path, sustain.path, release.path, delay.path, curved.path]).size).toBe(8)
  })
})

describe('filter response visualization', () => {
  const base: FilterState = {
    enabled: true,
    type: 'lowpass',
    cutoffHz: 1_000,
    resonance: 0.2,
    slope: 12,
    drive: 0,
    keytrack: 0,
  }

  function response(type: FilterType) {
    return createFilterResponsePlot({ ...base, type })
  }

  it('produces distinct low-pass, high-pass, band-pass, and notch semantics', () => {
    const lowpass = response('lowpass')
    const highpass = response('highpass')
    const bandpass = response('bandpass')
    const notch = response('notch')
    const centerIndex = lowpass.points.reduce((closest, point, index, points) => {
      const currentDistance = Math.abs(point.x - lowpass.cutoffX)
      const closestDistance = Math.abs(points[closest].x - lowpass.cutoffX)
      return currentDistance < closestDistance ? index : closest
    }, 0)

    expect(lowpass.points[0].gain).toBeGreaterThan(lowpass.points.at(-1)!.gain)
    expect(highpass.points[0].gain).toBeLessThan(highpass.points.at(-1)!.gain)
    expect(bandpass.points[centerIndex].gain).toBeGreaterThan(bandpass.points[0].gain)
    expect(notch.points[centerIndex].gain).toBeLessThan(notch.points[0].gain)
    expect(new Set([lowpass.path, highpass.path, bandpass.path, notch.path]).size).toBe(4)
  })

  it('moves with cutoff and changes shape with resonance', () => {
    const basePlot = createFilterResponsePlot(base)
    const brighter = createFilterResponsePlot({ ...base, cutoffHz: 8_000 })
    const resonant = createFilterResponsePlot({ ...base, resonance: 0.9 })

    expect(brighter.cutoffX).toBeGreaterThan(basePlot.cutoffX)
    expect(brighter.path).not.toBe(basePlot.path)
    expect(resonant.path).not.toBe(basePlot.path)
  })

  it('uses the slider logarithmic scale for endpoints and the geometric midpoint', () => {
    const geometricMidpoint = WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE.fromPosition(
      0.5,
      FILTER_CUTOFF_MIN_HZ,
      FILTER_CUTOFF_MAX_HZ,
    )
    const low = createFilterResponsePlot({ ...base, cutoffHz: FILTER_CUTOFF_MIN_HZ })
    const middle = createFilterResponsePlot({ ...base, cutoffHz: geometricMidpoint })
    const high = createFilterResponsePlot({ ...base, cutoffHz: FILTER_CUTOFF_MAX_HZ })

    expect(geometricMidpoint).toBe(
      Math.round(Math.sqrt(FILTER_CUTOFF_MIN_HZ * FILTER_CUTOFF_MAX_HZ)),
    )
    expect(low.cutoffPosition).toBe(0)
    expect(low.cutoffX).toBe(2)
    expect(middle.cutoffPosition).toBe(
      WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE.toPosition(
        geometricMidpoint,
        FILTER_CUTOFF_MIN_HZ,
        FILTER_CUTOFF_MAX_HZ,
      ),
    )
    expect(middle.cutoffPosition).toBeCloseTo(0.5, 3)
    expect(middle.cutoffX).toBeCloseTo(50, 1)
    expect(high.cutoffPosition).toBe(1)
    expect(high.cutoffX).toBe(98)
    expect(normalizedFilterCutoff(base.cutoffHz)).toBe(
      WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE.toPosition(
        base.cutoffHz,
        FILTER_CUTOFF_MIN_HZ,
        FILTER_CUTOFF_MAX_HZ,
      ),
    )
  })
})
