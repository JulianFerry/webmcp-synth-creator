import { describe, expect, it } from 'vitest'

import verticalSliceFixture from '../../fixtures/patches/vertical-slice.patch.json'
import { parsePatchState } from '../../src/patch/schemas'
import { upgradePatchDocument } from '../../src/patch/upgrade'

describe('patch document upgrade', () => {
  it('upgrades a version 1 document with a silent third oscillator', () => {
    const upgraded = parsePatchState(verticalSliceFixture)

    expect(upgraded.version).toBe(3)
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
      pan: 0.5,
    })
    expect(upgraded.ampEnvelope).toMatchObject({
      delaySeconds: 0,
      attackCurve: 0,
      decayCurve: -0.1,
      releaseCurve: -0.1,
    })
    expect(upgraded.filter).toMatchObject({ slope: 12, drive: 0, keytrack: 0 })
    expect(upgraded.effects.distortion.enabled).toBe(false)
    expect(upgraded.effects.chorus.enabled).toBe(false)
  })

  it('upgrades version 2 fields with sound-preserving defaults', () => {
    const v2 = upgradePatchDocument(verticalSliceFixture) as Record<string, unknown>
    const downgraded = structuredClone(v2) as any
    downgraded.version = 2
    downgraded.oscillators.forEach((oscillator: any) => delete oscillator.pan)
    for (const envelope of [downgraded.ampEnvelope, downgraded.modEnvelope]) {
      delete envelope.delaySeconds
      delete envelope.attackCurve
      delete envelope.decayCurve
      delete envelope.releaseCurve
    }
    delete downgraded.filter.slope
    delete downgraded.filter.drive
    delete downgraded.filter.keytrack
    delete downgraded.lfo1.smoothing
    delete downgraded.voice.transposeSemitones
    delete downgraded.effects.distortion
    delete downgraded.effects.chorus
    delete downgraded.effects.reverb.predelay
    delete downgraded.effects.reverb.lowCut
    delete downgraded.effects.reverb.highCut

    const upgraded = parsePatchState(downgraded)
    expect(upgraded.version).toBe(3)
    expect(upgraded.oscillators.map(({ pan }) => pan)).toEqual([0.5, 0.5, 0.5])
    expect(upgraded.lfo1.smoothing).toBe(upgraded.lfo1.smooth ? 5 / 14 : 1.5 / 14)
    expect(upgraded.effects.reverb).toMatchObject({ predelay: 0, lowCut: 0, highCut: 110 / 128 })
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
