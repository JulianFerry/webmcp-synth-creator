import { describe, expect, it } from 'vitest'

import verticalSliceFixture from '../../fixtures/patches/vertical-slice.patch.json'
import { parsePatchState } from '../../src/patch/schemas'
import { upgradePatchDocument } from '../../src/patch/upgrade'

describe('patch document upgrade', () => {
  it('upgrades a version 1 document with a silent third oscillator', () => {
    const upgraded = parsePatchState(verticalSliceFixture)

    expect(upgraded.version).toBe(2)
    expect(upgraded.oscillators).toHaveLength(3)
    expect(upgraded.oscillators[2]).toEqual({
      enabled: false,
      wavetableId: upgraded.oscillators[0].wavetableId,
      wavetablePosition: 0,
      level: 0,
      transposeSemitones: 0,
      fineTuneCents: 0,
      unisonVoices: 1,
      unisonDetune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    })
  })

  it('is idempotent after the first upgrade', () => {
    const once = upgradePatchDocument(verticalSliceFixture)
    expect(upgradePatchDocument(once)).toEqual(once)
  })

  it('leaves unrecognized documents for schema validation to reject', () => {
    const invalid = { version: 1, oscillators: [] }
    expect(upgradePatchDocument(invalid)).toBe(invalid)
    expect(() => parsePatchState(invalid)).toThrow()
  })
})
