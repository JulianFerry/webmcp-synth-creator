import type { WavetableState } from '../../patch/types'
import { generatedWavetable, harmonicFrame } from './helpers'

export const TONAL_WAVETABLES: readonly WavetableState[] = [
  generatedWavetable('sine', 'Sine', [harmonicFrame(1, () => 1)]),
  generatedWavetable('triangle', 'Triangle', [
    harmonicFrame(31, (harmonic) => (harmonic % 2 === 1 ? 1 / harmonic ** 2 : 0)),
  ]),
  generatedWavetable('saw', 'Saw', [
    harmonicFrame(48, (harmonic) => 1 / harmonic),
    harmonicFrame(48, (harmonic) => 1 / harmonic ** 1.45),
  ]),
  generatedWavetable('soft-square', 'Soft Square', [
    harmonicFrame(47, (harmonic) =>
      harmonic % 2 === 1 ? 1 / harmonic ** 1.25 : 0,
    ),
    harmonicFrame(47, (harmonic) =>
      harmonic % 2 === 1 ? 1 / harmonic ** 1.8 : 0,
    ),
  ]),
  generatedWavetable('warm-saw', 'Warm Saw', [
    harmonicFrame(40, (harmonic) => 1 / harmonic ** 1.12),
    harmonicFrame(40, (harmonic) => {
      const evenWarmth = harmonic % 2 === 0 ? 0.72 : 1
      return evenWarmth / harmonic ** 1.3
    }),
    harmonicFrame(40, (harmonic) => 1 / harmonic ** 1.7),
  ]),
  generatedWavetable('hollow', 'Hollow', [
    harmonicFrame(40, (harmonic) =>
      harmonic % 2 === 1 ? 1 / harmonic ** 1.1 : 0.04 / harmonic,
    ),
    harmonicFrame(40, (harmonic) => {
      const body = harmonic % 3 === 1 ? 1 : 0.14
      return body / harmonic ** 1.28
    }),
    harmonicFrame(40, (harmonic) => {
      const body = harmonic % 4 === 1 ? 1 : 0.08
      return body / harmonic ** 1.45
    }),
  ]),
]
