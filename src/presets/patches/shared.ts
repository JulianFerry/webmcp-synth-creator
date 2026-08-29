import { parsePatchState } from '../../patch/schemas'
import type { PatchState } from '../../patch/types'
import { createWavetableData } from '../../wavetables/registry'

function fixtureWavetableIds(fixture: unknown): string[] {
  if (!fixture || typeof fixture !== 'object') {
    throw new TypeError('Curated patch fixture must be an object')
  }
  const oscillators = (fixture as { oscillators?: unknown }).oscillators
  if (!Array.isArray(oscillators) || oscillators.length !== 3) {
    throw new TypeError('Curated patch fixture must define three oscillators')
  }

  return oscillators.map((oscillator, index) => {
    const wavetableId = (oscillator as { wavetableId?: unknown })?.wavetableId
    if (typeof wavetableId !== 'string') {
      throw new TypeError(`Curated patch oscillator ${index + 1} has no wavetableId`)
    }
    return wavetableId
  })
}

export function createCuratedPatch(fixture: unknown): PatchState {
  const wavetableIds = [...new Set(fixtureWavetableIds(fixture))]
  return parsePatchState({
    ...structuredClone(fixture as object),
    wavetableData: createWavetableData(wavetableIds),
  })
}
