import type { EnvelopeState, FilterState } from '../patch/types'
import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../patch/limits'
import { WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE } from './controls/parameterScale'
import { envelopeCurvePosition } from '../audio/lfo'

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
  delayEndX: number
  attackEndX: number
  holdEndX: number
  decayEndX: number
  sustainY: number
  releaseStartX: number
  releaseEndX: number
}

function phaseWidth(seconds: number, maximum: number): number {
  return 4 + 14 * Math.sqrt(clamp(seconds, 0, maximum) / maximum)
}

export function createEnvelopePlot(envelope: EnvelopeState): EnvelopePlotGeometry {
  const delayEndX = 4 + phaseWidth(envelope.delaySeconds, 4)
  const attackEndX = delayEndX + phaseWidth(envelope.attackSeconds, 3)
  const holdEndX = attackEndX + phaseWidth(envelope.holdSeconds, 4)
  const decayEndX = holdEndX + phaseWidth(envelope.decaySeconds, 5)
  const sustainY = 29 - clamp(envelope.sustainLevel, 0, 1) * 26
  const releaseStartX = Math.min(decayEndX + 14, 76)
  const releaseEndX = Math.min(96, releaseStartX + phaseWidth(envelope.releaseSeconds, 8))

  const curvedPhase = (startX: number, endX: number, startY: number, endY: number, curve: number) =>
    Array.from({ length: 9 }, (_, index) => {
      const progress = index / 8
      const curved = envelopeCurvePosition(progress, curve)
      return `L${point(startX + (endX - startX) * progress)} ${point(startY + (endY - startY) * curved)}`
    }).join(' ')

  return {
    path: [
      'M4 29',
      `L${point(delayEndX)} 29`,
      curvedPhase(delayEndX, attackEndX, 29, 3, envelope.attackCurve),
      `L${point(holdEndX)} 3`,
      curvedPhase(holdEndX, decayEndX, 3, sustainY, envelope.decayCurve),
      `L${point(releaseStartX)} ${point(sustainY)}`,
      curvedPhase(releaseStartX, releaseEndX, sustainY, 29, envelope.releaseCurve),
      'L96 29',
    ].join(' '),
    delayEndX,
    attackEndX,
    holdEndX,
    decayEndX,
    sustainY,
    releaseStartX,
    releaseEndX,
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
