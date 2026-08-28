import { describe, expect, it } from 'vitest'

import { createWavetableData } from '../../src/wavetables/registry'
import {
  renderWavetablePosition,
  wavetableSupportsMorphing,
} from '../../src/wavetables/render'

describe('wavetable position rendering', () => {
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
