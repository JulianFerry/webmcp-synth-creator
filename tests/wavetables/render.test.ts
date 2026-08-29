import { describe, expect, it } from 'vitest'

import { createWavetableData } from '../../src/wavetables/registry'
import { rotatePeriodicWaveCoefficients } from '../../src/audio/WavetableVoiceOscillator'
import {
  renderWavetablePosition,
  wavetableSupportsMorphing,
} from '../../src/wavetables/render'

describe('wavetable position rendering', () => {
  it('rotates every harmonic by its phase multiple for per-note phase randomization', () => {
    const rotated = rotatePeriodicWaveCoefficients(
      new Float32Array([0, 1, 1]),
      new Float32Array([0, 0, 0]),
      0.25,
    )

    expect(Array.from(rotated.real)).toEqual([0, expect.closeTo(0), -1])
    expect(Array.from(rotated.imag)).toEqual([0, -1, expect.closeTo(0)])
  })

  it('keeps a one-frame sine exactly position invariant', () => {
    const sine = createWavetableData(['sine']).sine

    expect(wavetableSupportsMorphing(sine)).toBe(false)
    expect([...renderWavetablePosition(sine, 0, 128)]).toEqual([
      ...renderWavetablePosition(sine, 1, 128),
    ])
  })

  it('interpolates the actual adjacent frames of a morphing table', () => {
    const airy = createWavetableData(['airy']).airy
    const start = renderWavetablePosition(airy, 0, 128)
    const middle = renderWavetablePosition(airy, 0.5, 128)
    const end = renderWavetablePosition(airy, 1, 128)

    expect(wavetableSupportsMorphing(airy)).toBe(true)
    expect([...start]).not.toEqual([...end])
    expect([...middle]).not.toEqual([...start])
    expect([...middle]).not.toEqual([...end])
  })
})
