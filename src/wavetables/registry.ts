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

const WAVETABLE_CHARACTER_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  sine: 'Pure fundamental with no upper harmonics.',
  triangle: 'Soft, rounded tone with gently fading odd harmonics.',
  saw: 'Full-spectrum saw that moves from bright to progressively softer.',
  'soft-square': 'Hollow odd-harmonic pulse with a softened upper register.',
  'warm-saw': 'Warm saw with restrained highs and subtly shaped even harmonics.',
  hollow: 'Open, woody spectrum with sparse resonant harmonic families.',
  harsh: 'Aggressive sync-like spectrum with dense, slowly decaying highs.',
  airy: 'Bright saw-like body with a light, shimmering high-frequency halo.',
  glass: 'Sparse inharmonic partials for a clear, struck-glass character.',
  metallic: 'Moving clustered partials with a resonant metallic ring.',
  digital: 'Stepped harmonic bands with a crisp, synthetic edge.',
  vocal: 'Moving formant peaks that sweep through vowel-like colors.',
})

for (const id of GENERATED_WAVETABLE_IDS) {
  if (!WAVETABLE_CHARACTER_DESCRIPTIONS[id]) {
    throw new Error(`Generated wavetable has no character description: ${id}`)
  }
}

export const WAVETABLE_CAPABILITIES = Object.freeze(
  GENERATED_WAVETABLE_IDS.map((id) => ({
    id,
    name: WAVETABLE_REGISTRY[id].name,
    character: WAVETABLE_CHARACTER_DESCRIPTIONS[id],
  })),
)

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
