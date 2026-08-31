import { describe, expect, it } from 'vitest'

import type { PatchState } from '../../src/patch/types'
import {
  CALIBRATION_A_PATCH,
  CALIBRATION_B_PATCH,
  CALIBRATION_C_PATCH,
  CALIBRATION_D_PATCH,
  CALIBRATION_E_PATCH,
  CALIBRATION_F_PATCH,
  CALIBRATION_G_PATCH,
  CALIBRATION_H_PATCH,
} from '../../src/presets/patches/calibration'

function changedSignalSections(before: PatchState, after: PatchState): string[] {
  const ignored = new Set<keyof PatchState>(['metadata', 'wavetableData'])
  return (Object.keys(before) as Array<keyof PatchState>)
    .filter((key) => !ignored.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort()
}

describe('browser/Vital calibration ladder', () => {
  it('starts with one deterministic sine and every optional subsystem bypassed', () => {
    const patch = CALIBRATION_A_PATCH

    expect(patch.oscillators[0]).toMatchObject({
      enabled: true,
      wavetableId: 'sine',
      level: 1,
      unisonVoices: 1,
      randomPhase: 0,
    })
    expect(patch.oscillators[1]).toMatchObject({ enabled: false, level: 1 })
    expect(patch.ampEnvelope).toEqual({
      attackSeconds: 0,
      holdSeconds: 0,
      decaySeconds: 0,
      sustainLevel: 1,
      releaseSeconds: 0.005,
    })
    expect(patch.filter.enabled).toBe(false)
    expect(patch.lfo1.enabled).toBe(false)
    expect(patch.modulations).toEqual([])
    expect(patch.effects.delay.enabled).toBe(false)
    expect(patch.effects.reverb.enabled).toBe(false)
    expect(patch.voice.velocitySensitivity).toBe(0)
  })

  it('adds only the named signal subsystem at each cumulative stage', () => {
    expect(changedSignalSections(CALIBRATION_A_PATCH, CALIBRATION_B_PATCH)).toEqual([
      'oscillators',
    ])
    expect(changedSignalSections(CALIBRATION_B_PATCH, CALIBRATION_C_PATCH)).toEqual([
      'ampEnvelope',
    ])
    expect(changedSignalSections(CALIBRATION_C_PATCH, CALIBRATION_D_PATCH)).toEqual([
      'oscillators',
    ])
    expect(changedSignalSections(CALIBRATION_D_PATCH, CALIBRATION_E_PATCH)).toEqual(['filter'])
    expect(changedSignalSections(CALIBRATION_E_PATCH, CALIBRATION_F_PATCH)).toEqual([
      'lfo1',
      'modulations',
    ])
    expect(changedSignalSections(CALIBRATION_F_PATCH, CALIBRATION_G_PATCH)).toEqual([
      'oscillators',
    ])
    expect(changedSignalSections(CALIBRATION_G_PATCH, CALIBRATION_H_PATCH)).toEqual(['effects'])
  })

  it('keeps diagnostic stages deterministic and configures a near-silence LFO gate', () => {
    expect(CALIBRATION_D_PATCH.oscillators[0]).toMatchObject({
      unisonVoices: 5,
      unisonDetune: 0.25,
      stereoSpread: 0.8,
      randomPhase: 0,
    })
    expect(CALIBRATION_F_PATCH.lfo1).toMatchObject({
      enabled: true,
      phase: 0,
      rate: { mode: 'sync', division: '1/8' },
    })
    expect(CALIBRATION_F_PATCH.modulations).toEqual([
      {
        id: 'calibration-lfo-gate',
        source: 'lfo1',
        destination: 'oscillator1.level',
        amount: -0.68,
        bipolar: false,
      },
    ])
    expect(CALIBRATION_G_PATCH.oscillators[1]).toMatchObject({
      enabled: true,
      wavetableId: 'sine',
      level: 1,
      transposeSemitones: 12,
      unisonVoices: 1,
      randomPhase: 0,
    })
  })
})
