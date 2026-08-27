import type { WavetableState } from '../patch/types'

function normalizeHarmonics(harmonics: number[]): number[] {
  const peak = Math.max(...harmonics, 1)
  return harmonics.map((value) => value / peak)
}

function harmonicSeries(
  count: number,
  amplitude: (harmonic: number) => number,
): number[] {
  return normalizeHarmonics(
    Array.from({ length: count }, (_, index) => Math.max(0, amplitude(index + 1))),
  )
}

const sine: WavetableState = {
  id: 'sine',
  name: 'Generated Sine',
  frames: [{ harmonics: [1] }],
}

const airy: WavetableState = {
  id: 'airy',
  name: 'Generated Air Spectrum',
  frames: [
    {
      harmonics: harmonicSeries(48, (harmonic) => 1 / harmonic ** 1.05),
    },
    {
      harmonics: harmonicSeries(48, (harmonic) => {
        const shimmer = harmonic % 4 === 0 ? 0.18 : harmonic % 7 === 0 ? 0.1 : 0
        return 1 / harmonic ** 1.3 + shimmer / Math.sqrt(harmonic)
      }),
    },
  ],
}

const triangle: WavetableState = {
  id: 'triangle',
  name: 'Generated Triangle',
  frames: [
    {
      harmonics: harmonicSeries(31, (harmonic) => {
        if (harmonic % 2 === 0) return 0
        return 1 / harmonic ** 2
      }),
    },
  ],
}

export const WAVETABLE_REGISTRY: Readonly<Record<string, WavetableState>> = Object.freeze({
  airy,
  sine,
  triangle,
})

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
