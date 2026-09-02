import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { parsePatchState } from '../../src/patch/schemas'

describe('fixed Workbench modulation routing', () => {
  it('normalizes valid preset-specific routes to the global oscillator-level LFO', () => {
    const patch = createDefaultPatch()
    patch.modulations = [
      {
        id: 'preset-specific-route',
        source: 'lfo1',
        destination: 'filter.cutoff',
        amount: 0.25,
        bipolar: true,
      },
    ]

    expect(parsePatchState(patch).modulations.map(({ destination }) => destination)).toEqual([
      'oscillator1.level',
      'oscillator2.level',
      'oscillator3.level',
    ])
  })

  it('rejects unknown route members and duplicate route pairs', () => {
    const unknownSource = createDefaultPatch() as any
    unknownSource.modulations[0].source = 'macro1'
    expect(() => parsePatchState(unknownSource)).toThrow()

    const unknownDestination = createDefaultPatch() as any
    unknownDestination.modulations[0].destination = 'filter.warmth'
    expect(() => parsePatchState(unknownDestination)).toThrow()

    const duplicate = createDefaultPatch()
    duplicate.modulations.push({ ...duplicate.modulations[0], id: 'duplicate-id' })
    expect(() => parsePatchState(duplicate)).toThrow(/Duplicate modulation route/)
  })
})
