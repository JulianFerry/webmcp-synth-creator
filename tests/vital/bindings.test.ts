import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  FORCED_VITAL_BINDINGS,
  VITAL_BOUND_SETTING_KEYS,
  VITAL_SCALAR_BINDINGS,
  decodeVitalScalarValues,
  mapVitalScalarValues,
} from '../../src/vital/bindings'

describe('Vital scalar binding registry', () => {
  it('derives encoded setting keys and scalar decoding from the same exhaustive registry', () => {
    const patch = createDefaultPatch()
    const encoded = mapVitalScalarValues(patch)
    const decoded = decodeVitalScalarValues(encoded)

    expect(Object.keys(encoded).sort()).toEqual(
      Object.values(VITAL_SCALAR_BINDINGS)
        .map(({ key }) => key)
        .sort(),
    )
    expect(decoded['filter.drive']).toBe(patch.filter.drive)
    expect(decoded['effects.chorus.rate']).toBeCloseTo(patch.effects.chorus.rate)
    expect(decoded['ampEnvelope.decayCurve']).toBe(patch.ampEnvelope.decayCurve)
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

    expect(mapVitalScalarValues(patch)).toMatchObject({
      filter_fx_keytrack: 0.75,
      distortion_drive: 15,
      chorus_feedback: 0.95,
    })
  })
})
