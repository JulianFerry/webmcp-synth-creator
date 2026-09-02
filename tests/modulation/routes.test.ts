import { describe, expect, it } from 'vitest'

import { MODULATION_DESTINATIONS_BY_SOURCE } from '../../src/patch/modulation'
import { createDefaultPatch } from '../../src/patch/defaults'
import { parsePatchState } from '../../src/patch/schemas'
import type { ModulationRoute } from '../../src/patch/types'

describe('closed modulation matrix', () => {
  it('accepts every declared source-destination pair', () => {
    let count = 0
    for (const [source, destinations] of Object.entries(MODULATION_DESTINATIONS_BY_SOURCE)) {
      for (const destination of destinations) {
        const patch = createDefaultPatch()
        patch.modulations = [
          {
            id: `route-${count}`,
            source,
            destination,
            amount: 0.25,
            bipolar: false,
          } as ModulationRoute,
        ]
        expect(parsePatchState(patch).modulations[0]).toMatchObject({ source, destination })
        count += 1
      }
    }
    expect(count).toBe(30)
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
