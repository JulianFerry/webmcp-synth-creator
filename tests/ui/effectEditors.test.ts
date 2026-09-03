import { describe, expect, it } from 'vitest'

import { EFFECT_IDS } from '../../src/patch/effects'
import { CONCRETE_EFFECT_EDITOR_IDS } from '../../src/ui/tabs/ModulationEffectsTab'

describe('modulation effects editors', () => {
  it('provides a concrete editor for every effect without a generic processor fallback', () => {
    expect(CONCRETE_EFFECT_EDITOR_IDS).toEqual(EFFECT_IDS)
    expect(new Set(CONCRETE_EFFECT_EDITOR_IDS).size).toBe(EFFECT_IDS.length)
  })
})
