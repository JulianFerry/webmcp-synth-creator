import type { WavetableState } from '../patch/types'
import { SPECTRAL_WAVETABLES } from './definitions/spectral'
import { TONAL_WAVETABLES } from './definitions/tonal'

const generatedWavetables = [...TONAL_WAVETABLES, ...SPECTRAL_WAVETABLES]
const generatedIds = generatedWavetables.map(({ id }) => id)
if (new Set(generatedIds).size !== generatedIds.length) {
  throw new Error('Generated wavetable ids must be unique')
}

export const WAVETABLE_REGISTRY: Readonly<Record<string, WavetableState>> = Object.freeze(
  Object.fromEntries(
    generatedWavetables.map((wavetable) => [wavetable.id, structuredClone(wavetable)]),
  ),
)

export const GENERATED_WAVETABLE_IDS = Object.freeze([...generatedIds])

export function createWavetableData(ids: readonly string[]): Record<string, WavetableState> {
  return Object.fromEntries(
    ids.map((id) => {
      const wavetable = WAVETABLE_REGISTRY[id]
      if (!wavetable) throw new RangeError(`Unknown generated wavetable: ${id}`)
      return [id, structuredClone(wavetable)]
    }),
  )
}

export function resolveWavetable(
  data: Record<string, WavetableState>,
  id: string,
): WavetableState {
  const wavetable = data[id]
  if (!wavetable) throw new RangeError(`Patch references unknown wavetable: ${id}`)
  return wavetable
}
