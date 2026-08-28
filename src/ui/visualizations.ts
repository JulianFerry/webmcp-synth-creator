import type { EnvelopeState, FilterState } from '../patch/types'
import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../patch/limits'
import { WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE } from './controls/parameterScale'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function point(value: number): string {
  return value.toFixed(2)
}

export function buildWaveformPath(
  samples: Float32Array,
  width = 100,
  height = 52,
): string {
  if (samples.length === 0) return ''
  const center = height / 2
  const amplitude = height * 0.42
  return Array.from(samples, (sample, index) => {
    const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * width
    const y = center - clamp(sample, -1, 1) * amplitude
    return `${index === 0 ? 'M' : 'L'}${point(x)} ${point(y)}`
  }).join(' ')
}

export interface EnvelopePlotGeometry {
  path: string
  attackEndX: number
  decayEndX: number
  sustainY: number
  releaseStartX: number
}

function phaseWidth(seconds: number, maximum: number): number {
  return 6 + 18 * Math.sqrt(clamp(seconds, 0, maximum) / maximum)
}

export function createEnvelopePlot(envelope: EnvelopeState): EnvelopePlotGeometry {
  const attackEndX = 2 + phaseWidth(envelope.attackSeconds, 3)
  const decayEndX = attackEndX + phaseWidth(envelope.decaySeconds, 5)
  const sustainY = 64 - clamp(envelope.sustainLevel, 0, 1) * 57
  const releaseStartX = 98 - phaseWidth(envelope.releaseSeconds, 8)

  return {
    path: [
      'M2 64',
      `L${point(attackEndX)} 7`,
      `L${point(decayEndX)} ${point(sustainY)}`,
      `L${point(releaseStartX)} ${point(sustainY)}`,
      'L98 64',
    ].join(' '),
    attackEndX,
    decayEndX,
    sustainY,
    releaseStartX,
  }
}

export interface FilterResponsePoint {
  x: number
  y: number
  gain: number
}

export interface FilterResponsePlot {
  path: string
  cutoffX: number
  cutoffPosition: number
  points: FilterResponsePoint[]
}

export function normalizedFilterCutoff(cutoffHz: number): number {
  return WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE.toPosition(
    cutoffHz,
    FILTER_CUTOFF_MIN_HZ,
    FILTER_CUTOFF_MAX_HZ,
  )
}

export function createFilterResponsePlot(filter: FilterState): FilterResponsePlot {
  const cutoff = normalizedFilterCutoff(filter.cutoffHz)
  const resonance = clamp(filter.resonance, 0, 1)
  const width = 0.035 + (1 - resonance) * 0.1
  const points = Array.from({ length: 65 }, (_, index): FilterResponsePoint => {
    const normalizedX = index / 64
    const distance = (normalizedX - cutoff) / width
    const lowpass = 1 / (1 + Math.exp(distance * 3.5))
    const highpass = 1 - lowpass
    const band = Math.exp(-0.5 * distance ** 2)
    const resonancePeak = resonance * 0.24 * Math.exp(-0.5 * (distance / 0.42) ** 2)
    let gain: number

    switch (filter.type) {
      case 'highpass':
        gain = highpass + resonancePeak
        break
      case 'bandpass':
        gain = band
        break
      case 'notch':
        gain = 1 - band
        break
      default:
        gain = lowpass + resonancePeak
    }

    const x = 2 + normalizedX * 96
    const y = 62 - clamp(gain, 0, 1.2) * (55 / 1.2)
    return { x, y, gain }
  })

  return {
    path: points
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${point(x)} ${point(y)}`)
      .join(' '),
    cutoffX: 2 + cutoff * 96,
    cutoffPosition: cutoff,
    points,
  }
}
