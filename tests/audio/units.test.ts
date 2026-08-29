import { describe, expect, it } from 'vitest'

import {
  centsToRatio,
  createUnisonPlacements,
  equalPowerMix,
  midiToHz,
  transposeFrequency,
  velocityToGain,
  vitalPowerScale,
} from '../../src/audio/units'

describe('audio unit conversions', () => {
  it('converts MIDI, semitone, and cent pitch values', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(60)).toBeCloseTo(261.626, 3)
    expect(centsToRatio(1200)).toBe(2)
    expect(transposeFrequency(69, 12, 0)).toBe(880)
    expect(transposeFrequency(69, 0, -100)).toBeCloseTo(midiToHz(68), 8)
  })

  it('maps velocity sensitivity without mutating the normalized input range', () => {
    expect(velocityToGain(0.25, 0)).toBe(1)
    expect(velocityToGain(0.25, 1)).toBe(0.25)
    expect(velocityToGain(0.25, 0.5)).toBe(0.625)
    expect(velocityToGain(2, 1)).toBe(1)
  })

  it('matches Vital power curves and equal-power effect mixing', () => {
    expect(vitalPowerScale(0.5, 0)).toBe(0.5)
    expect(vitalPowerScale(0.5, 1.5)).toBeCloseTo(0.3208213, 7)
    expect(equalPowerMix(0.5)).toEqual({
      dry: expect.closeTo(Math.SQRT1_2),
      wet: expect.closeTo(Math.SQRT1_2),
    })
  })
})

describe('unison placement', () => {
  it('places one voice in the center without detune', () => {
    expect(createUnisonPlacements(1, 1, 1)).toEqual([
      { detuneCents: 0, pan: 0, gain: 1 },
    ])
  })

  it('spreads an odd unison group symmetrically across pitch and stereo', () => {
    const placements = createUnisonPlacements(5, 0.5, 0.8)

    expect(placements.map((placement) => placement.detuneCents)).toEqual([
      -12,
      expect.closeTo(-3.8498558),
      0,
      expect.closeTo(3.8498558),
      12,
    ])
    expect(placements.map((placement) => placement.pan)).toEqual([-0.8, -0.4, 0, 0.4, 0.8])
    expect(placements.every((placement) => Math.abs(placement.gain - 1 / Math.sqrt(5)) < 1e-8)).toBe(true)
  })

  it('rejects invalid unison counts', () => {
    expect(() => createUnisonPlacements(0, 0, 0)).toThrow(/positive integer/)
    expect(() => createUnisonPlacements(2.5, 0, 0)).toThrow(/positive integer/)
  })
})
