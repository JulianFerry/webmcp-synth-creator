export interface SpectrogramGrid {
  windows: number
  bins: number
  magnitudes: Float32Array
  maxFrequencyHz: number
}

export interface SpectrogramOptions {
  maxBins?: number
  maxFrequencyHz?: number
  maxWindows?: number
  windowSize?: number
}

const DEFAULT_WINDOW_SIZE = 1024

function fftMagnitudes(samples: Float32Array): Float32Array {
  const size = samples.length
  const real = new Float64Array(size)
  const imaginary = new Float64Array(size)
  for (let index = 0; index < size; index += 1) {
    const angle = size === 1 ? 0 : (2 * Math.PI * index) / (size - 1)
    real[index] = samples[index] * (0.5 - 0.5 * Math.cos(angle))
  }

  for (let index = 1, target = 0; index < size; index += 1) {
    let bit = size >> 1
    for (; target & bit; bit >>= 1) target ^= bit
    target ^= bit
    if (index < target) {
      ;[real[index], real[target]] = [real[target], real[index]]
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)
    for (let start = 0; start < size; start += length) {
      let phaseReal = 1
      let phaseImaginary = 0
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset
        const odd = even + length / 2
        const oddReal = real[odd] * phaseReal - imaginary[odd] * phaseImaginary
        const oddImaginary = real[odd] * phaseImaginary + imaginary[odd] * phaseReal
        real[odd] = real[even] - oddReal
        imaginary[odd] = imaginary[even] - oddImaginary
        real[even] += oddReal
        imaginary[even] += oddImaginary
        const nextReal = phaseReal * stepReal - phaseImaginary * stepImaginary
        phaseImaginary = phaseReal * stepImaginary + phaseImaginary * stepReal
        phaseReal = nextReal
      }
    }
  }

  const magnitudes = new Float32Array(size / 2 + 1)
  for (let index = 0; index < magnitudes.length; index += 1) {
    magnitudes[index] = Math.hypot(real[index], imaginary[index])
  }
  return magnitudes
}

export function buildSpectrogramGrid(
  samples: Float32Array,
  sampleRate: number,
  options: SpectrogramOptions = {},
): SpectrogramGrid {
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE
  const maxWindows = options.maxWindows ?? 48
  const bins = options.maxBins ?? 48
  const nyquist = Math.max(0, sampleRate / 2)
  const maxFrequencyHz = Math.min(options.maxFrequencyHz ?? 16_000, nyquist)
  if (samples.length === 0 || sampleRate <= 0 || windowSize < 2 || (windowSize & (windowSize - 1)) !== 0 || bins < 1 || maxWindows < 1) {
    return { windows: 0, bins: 0, magnitudes: new Float32Array(), maxFrequencyHz }
  }

  const windows = Math.min(maxWindows, Math.max(1, Math.ceil(samples.length / windowSize)))
  const output = new Float32Array(windows * bins)
  let peak = 0
  for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
    const start = windows === 1 ? 0 : Math.round(windowIndex * Math.max(0, samples.length - windowSize) / (windows - 1))
    const frame = new Float32Array(windowSize)
    frame.set(samples.subarray(start, Math.min(samples.length, start + windowSize)))
    const spectrum = fftMagnitudes(frame)
    for (let bin = 0; bin < bins; bin += 1) {
      const ratio = bins === 1 ? 0 : bin / (bins - 1)
      const frequency = maxFrequencyHz * (Math.expm1(ratio * Math.log(1 + maxFrequencyHz / 20)) / (maxFrequencyHz / 20))
      const fftBin = Math.min(spectrum.length - 1, Math.round(frequency * windowSize / sampleRate))
      const magnitude = Math.log1p(spectrum[fftBin])
      output[windowIndex * bins + bin] = magnitude
      peak = Math.max(peak, magnitude)
    }
  }
  if (peak > 0) for (let index = 0; index < output.length; index += 1) output[index] /= peak
  return { windows, bins, magnitudes: output, maxFrequencyHz }
}
