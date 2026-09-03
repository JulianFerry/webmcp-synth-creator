import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  FORCED_VITAL_BINDINGS,
  VITAL_BOUND_SETTING_KEYS,
  VITAL_SCALAR_BINDINGS,
  VITAL_DERIVED_SCALAR_BINDINGS,
  decodeVitalScalarValues,
  mapVitalScalarValues,
} from '../../src/vital/bindings'

describe('Vital scalar binding registry', () => {
  it('derives encoded setting keys and scalar decoding from the same exhaustive registry', () => {
    const patch = createDefaultPatch()
    const encoded = mapVitalScalarValues(patch)
    const decoded = decodeVitalScalarValues(encoded)

    expect(Object.keys(encoded).sort()).toEqual(
      [...Object.values(VITAL_SCALAR_BINDINGS), ...VITAL_DERIVED_SCALAR_BINDINGS]
        .map(({ key }) => key)
        .filter((key, index, keys) => keys.indexOf(key) === index)
        .sort(),
    )
    expect(decoded['filter.drive']).toBe(patch.filter.drive)
    expect(decoded['effects.chorus.rate']).toBeCloseTo(patch.effects.chorus.rate)
    expect(decoded['ampEnvelope.decayCurve']).toBe(patch.ampEnvelope.decayCurve)
    expect(decoded['effects.compressor.amount']).toBe(patch.effects.compressor.amount)
  })

  it('classifies all audited constants as forced and includes every binding key', () => {
    expect(FORCED_VITAL_BINDINGS).toHaveLength(16)
    expect(FORCED_VITAL_BINDINGS.every(({ ownership }) => ownership === 'forced')).toBe(true)
    for (const { key } of FORCED_VITAL_BINDINGS) expect(VITAL_BOUND_SETTING_KEYS.has(key)).toBe(true)
    for (const { key } of Object.values(VITAL_SCALAR_BINDINGS)) {
      expect(VITAL_BOUND_SETTING_KEYS.has(key)).toBe(true)
    }
  })

  it('maps workbench controls into their supported Vital ranges', () => {
    const patch = createDefaultPatch()
    patch.filter.keytrack = 0.75
    patch.effects.distortion.drive = 0.5
    patch.effects.chorus.feedback = 1
    patch.effects.compressor = { enabled: true, bands: 'high', amount: 0.75, attack: 0.2, release: 0.8, mix: 0.6 }

    expect(mapVitalScalarValues(patch)).toMatchObject({
      filter_fx_keytrack: 0.75,
      distortion_drive: 15,
      chorus_feedback: 0.95,
      compressor_on: 1,
      compressor_enabled_bands: 2,
      compressor_attack: 0.2,
      compressor_release: 0.8,
      compressor_mix: 0.6,
      compressor_low_upper_threshold: -43,
      compressor_band_upper_threshold: -40,
      compressor_high_upper_threshold: -45,
      compressor_low_lower_threshold: -50,
      compressor_band_lower_threshold: -51,
      compressor_high_lower_threshold: -50,
    })
    expect(VITAL_DERIVED_SCALAR_BINDINGS).toHaveLength(6)
  })
})
