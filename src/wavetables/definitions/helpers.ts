import type { WavetableFrameState, WavetableState } from '../../patch/types'

export function normalizeHarmonics(harmonics: readonly number[]): number[] {
  const sanitized = harmonics.map((value) => Math.max(0, Number.isFinite(value) ? value : 0))
  const peak = Math.max(...sanitized, 1e-12)
  return sanitized.map((value) => value / peak)
}

export function harmonicFrame(
  count: number,
  amplitude: (harmonic: number) => number,
): WavetableFrameState {
  return {
    harmonics: normalizeHarmonics(
      Array.from({ length: count }, (_, index) => amplitude(index + 1)),
    ),
  }
}

export function generatedWavetable(
  id: string,
  name: string,
  frames: WavetableFrameState[],
): WavetableState {
  return { id, name: `Generated ${name}`, frames }
}

export function gaussian(harmonic: number, center: number, width: number): number {
  return Math.exp(-0.5 * ((harmonic - center) / width) ** 2)
}
