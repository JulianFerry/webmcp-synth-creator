import type { WavetableState } from '../../patch/types'
import { gaussian, generatedWavetable, harmonicFrame } from './helpers'

export const SPECTRAL_WAVETABLES: readonly WavetableState[] = [
  generatedWavetable('airy', 'Air Spectrum', [
    harmonicFrame(48, (harmonic) => 1 / harmonic ** 1.05),
    harmonicFrame(48, (harmonic) => {
      const shimmer = harmonic % 4 === 0 ? 0.18 : harmonic % 7 === 0 ? 0.1 : 0
      return 1 / harmonic ** 1.3 + shimmer / Math.sqrt(harmonic)
    }),
    harmonicFrame(48, (harmonic) => {
      const airBand = gaussian(harmonic, 22, 7) * 0.08
      return 1 / harmonic ** 1.55 + airBand
    }),
  ]),
  generatedWavetable('glass', 'Glass', [
    harmonicFrame(48, (harmonic) => {
      const partial = [1, 5, 9, 16, 23, 31].includes(harmonic) ? 1 : 0.015
      return partial / harmonic ** 0.72
    }),
    harmonicFrame(48, (harmonic) => {
      const partial = [1, 7, 12, 19, 28, 39].includes(harmonic) ? 1 : 0.012
      return partial / harmonic ** 0.68
    }),
    harmonicFrame(48, (harmonic) => {
      const partial = [1, 4, 14, 21, 34, 46].includes(harmonic) ? 1 : 0.01
      return partial / harmonic ** 0.64
    }),
  ]),
  generatedWavetable('metallic', 'Metallic', [
    harmonicFrame(56, (harmonic) => {
      const cluster = gaussian(harmonic, 8, 1.1) + gaussian(harmonic, 21, 1.7)
      return (harmonic === 1 ? 1 : cluster * 0.72) / harmonic ** 0.34
    }),
    harmonicFrame(56, (harmonic) => {
      const cluster = gaussian(harmonic, 13, 1.4) + gaussian(harmonic, 32, 2.1)
      return (harmonic === 1 ? 0.75 : cluster) / harmonic ** 0.3
    }),
    harmonicFrame(56, (harmonic) => {
      const cluster = gaussian(harmonic, 18, 1.8) + gaussian(harmonic, 43, 2.4)
      return (harmonic === 1 ? 0.55 : cluster) / harmonic ** 0.27
    }),
  ]),
  generatedWavetable('digital', 'Digital Steps', [
    harmonicFrame(48, (harmonic) =>
      harmonic % 4 < 2 ? 1 / harmonic ** 0.9 : 0.08 / harmonic,
    ),
    harmonicFrame(48, (harmonic) =>
      harmonic % 6 < 3 ? 1 / harmonic ** 0.82 : 0.04 / harmonic,
    ),
    harmonicFrame(48, (harmonic) =>
      harmonic % 8 === 1 || harmonic % 8 === 2 ? 1 / harmonic ** 0.74 : 0.025 / harmonic,
    ),
    harmonicFrame(48, (harmonic) =>
      harmonic % 5 === 0 || harmonic === 1 ? 1 / harmonic ** 0.68 : 0.02 / harmonic,
    ),
  ]),
  generatedWavetable('vocal', 'Vocal Formants', [
    harmonicFrame(48, (harmonic) =>
      0.04 / harmonic + gaussian(harmonic, 4, 1.4) + gaussian(harmonic, 14, 2.8) * 0.72,
    ),
    harmonicFrame(48, (harmonic) =>
      0.04 / harmonic + gaussian(harmonic, 6, 1.7) + gaussian(harmonic, 19, 3.1) * 0.78,
    ),
    harmonicFrame(48, (harmonic) =>
      0.035 / harmonic + gaussian(harmonic, 9, 2.1) + gaussian(harmonic, 25, 3.6) * 0.82,
    ),
    harmonicFrame(48, (harmonic) =>
      0.03 / harmonic + gaussian(harmonic, 12, 2.5) + gaussian(harmonic, 33, 4.2) * 0.86,
    ),
  ]),
]
