import type { WavetableFrameState, WavetableState } from '../patch/types'

export const VITAL_FRAME_SAMPLE_COUNT = 2048

export interface PeriodicWaveCoefficients {
  real: Float32Array
  imag: Float32Array
}

function schroederPhase(index: number, harmonicCount: number): number {
  return (-Math.PI * index * (index + 1)) / Math.max(harmonicCount, 1)
}

export function toPeriodicWaveCoefficients(
  frame: WavetableFrameState,
): PeriodicWaveCoefficients {
  const coefficientCount = frame.harmonics.length + 1
  const real = new Float32Array(coefficientCount)
  const imag = new Float32Array(coefficientCount)

  frame.harmonics.forEach((amplitude, index) => {
    const harmonic = index + 1
    const phase = schroederPhase(harmonic, frame.harmonics.length)
    real[harmonic] = amplitude * Math.sin(phase)
    imag[harmonic] = amplitude * Math.cos(phase)
  })

  return { real, imag }
}

export function renderWavetableFrame(
  frame: WavetableFrameState,
  sampleCount = VITAL_FRAME_SAMPLE_COUNT,
): Float32Array {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new RangeError('Wavetable sample count must be an integer greater than one')
  }

  const samples = new Float32Array(sampleCount)
  frame.harmonics.forEach((amplitude, index) => {
    const harmonic = index + 1
    const phase = schroederPhase(harmonic, frame.harmonics.length)
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples[sampleIndex] +=
        amplitude * Math.sin((2 * Math.PI * harmonic * sampleIndex) / sampleCount + phase)
    }
  })

  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  if (peak > 0) {
    for (let index = 0; index < samples.length; index += 1) samples[index] /= peak
  }
  return samples
}

export function renderWavetable(wavetable: WavetableState): Float32Array[] {
  return wavetable.frames.map((frame) => renderWavetableFrame(frame))
}
