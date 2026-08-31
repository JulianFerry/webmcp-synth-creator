import type { VitalEngine } from './VitalEngine'

const SILENCE_THRESHOLD = 1e-8

export interface VitalOfflineRenderOptions {
  blockFrames?: number
  bpm?: number
  holdSeconds?: number
  note?: number
  tailSeconds?: number
  velocity?: number
}

export interface VitalOfflineMetrics {
  activeDurationSeconds: number
  audibleBlocks: number
  highFrequencyEnergy: number
  nonFiniteSamples: number
  peak: number
  renderDurationMs: number
  rms: number
  silentBlocks: number
  spectralCentroidHz: number
  stereoDifferenceRms: number
  tailCrestFactor: number
  tailRms: number
  unexpectedSilentHoldBlocks: number
  zeroCrossingHz: number
  zeroCrossings: number
}

export interface VitalOfflineRender {
  left: Float32Array
  metrics: VitalOfflineMetrics
  right: Float32Array
  sampleRate: number
}

export function renderVitalOffline(
  engine: VitalEngine,
  options: VitalOfflineRenderOptions = {},
): VitalOfflineRender {
  const {
    blockFrames = engine.maxBlockFrames,
    bpm = 120,
    holdSeconds = 2,
    note = 60,
    tailSeconds = 3,
    velocity = 100 / 127,
  } = options

  assertPositiveFinite(holdSeconds, 'hold duration')
  assertPositiveFinite(tailSeconds, 'tail duration')
  if (!Number.isInteger(blockFrames) || blockFrames <= 0 || blockFrames > engine.maxBlockFrames) {
    throw new RangeError(
      `Vital offline block size must be an integer between 1 and ${engine.maxBlockFrames}`,
    )
  }

  const holdFrames = Math.round(holdSeconds * engine.sampleRate)
  const totalFrames = holdFrames + Math.round(tailSeconds * engine.sampleRate)
  const left = new Float32Array(totalFrames)
  const right = new Float32Array(totalFrames)
  const blockLeft = new Float32Array(blockFrames)
  const blockRight = new Float32Array(blockFrames)

  engine.setBpm(bpm)
  engine.noteOn(note, velocity)

  let audibleBlocks = 0
  let silentBlocks = 0
  let heardDuringHold = false
  let unexpectedSilentHoldBlocks = 0
  const startedAt = performance.now()

  for (let offset = 0; offset < totalFrames; ) {
    if (offset === holdFrames) engine.noteOff(note)

    const framesUntilEvent = offset < holdFrames ? holdFrames - offset : totalFrames - offset
    const frames = Math.min(blockFrames, totalFrames - offset, framesUntilEvent)
    engine.process(frames)
    engine.copyStereoTo(blockLeft, blockRight, frames)
    left.set(blockLeft.subarray(0, frames), offset)
    right.set(blockRight.subarray(0, frames), offset)

    let blockPeak = 0
    for (let frame = 0; frame < frames; frame += 1) {
      blockPeak = Math.max(blockPeak, Math.abs(blockLeft[frame]), Math.abs(blockRight[frame]))
    }

    if (blockPeak > SILENCE_THRESHOLD) {
      audibleBlocks += 1
      if (offset < holdFrames) heardDuringHold = true
    } else {
      silentBlocks += 1
      if (offset < holdFrames && heardDuringHold) unexpectedSilentHoldBlocks += 1
    }

    offset += frames
  }

  const renderDurationMs = performance.now() - startedAt
  const metrics = measureVitalStereo(left, right, engine.sampleRate, {
    audibleBlocks,
    renderDurationMs,
    silentBlocks,
    unexpectedSilentHoldBlocks,
  })
  return { left, metrics, right, sampleRate: engine.sampleRate }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Vital offline ${label} must be a positive finite number`)
  }
}

export function measureVitalStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  blockMetrics: Pick<
    VitalOfflineMetrics,
    'audibleBlocks' | 'renderDurationMs' | 'silentBlocks' | 'unexpectedSilentHoldBlocks'
  > = {
    audibleBlocks: 0,
    renderDurationMs: 0,
    silentBlocks: 0,
    unexpectedSilentHoldBlocks: 0,
  },
): VitalOfflineMetrics {
  if (left.length !== right.length) throw new RangeError('Vital stereo channels must have equal length')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Vital analysis sample rate must be a positive finite number')
  }

  const monoSamples = new Float32Array(left.length)
  let nonFiniteSamples = 0
  let peak = 0
  let sumSquares = 0
  let monoSumSquares = 0
  let differenceSquared = 0
  let stereoDifferenceSquared = 0
  let zeroCrossings = 0
  let previousMono = 0
  let hasPreviousMono = false

  for (let frame = 0; frame < left.length; frame += 1) {
    const leftSample = left[frame]
    const rightSample = right[frame]
    if (!Number.isFinite(leftSample)) nonFiniteSamples += 1
    if (!Number.isFinite(rightSample)) nonFiniteSamples += 1
    if (!Number.isFinite(leftSample) || !Number.isFinite(rightSample)) continue

    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample))
    sumSquares += leftSample * leftSample + rightSample * rightSample

    const monoSample = (leftSample + rightSample) * 0.5
    const safeMonoSample = Number.isFinite(monoSample) ? monoSample : 0
    const stereoDifference = (leftSample - rightSample) * 0.5
    monoSumSquares += safeMonoSample * safeMonoSample
    stereoDifferenceSquared += stereoDifference * stereoDifference
    if (frame > 0) {
      const sampleDifference = safeMonoSample - monoSamples[frame - 1]
      differenceSquared += sampleDifference * sampleDifference
    }
    if (safeMonoSample !== 0) {
      if (hasPreviousMono && Math.sign(safeMonoSample) !== Math.sign(previousMono)) {
        zeroCrossings += 1
      }
      previousMono = safeMonoSample
      hasPreviousMono = true
    }
    monoSamples[frame] = safeMonoSample
  }

  const tailStart = Math.floor(monoSamples.length * 0.75)
  let tailSquared = 0
  let tailPeak = 0
  for (let frame = tailStart; frame < monoSamples.length; frame += 1) {
    tailSquared += monoSamples[frame] * monoSamples[frame]
    tailPeak = Math.max(tailPeak, Math.abs(monoSamples[frame]))
  }
  const tailRms = Math.sqrt(tailSquared / Math.max(1, monoSamples.length - tailStart))

  let lastActiveSample = 0
  const activityThreshold = peak * 0.01
  for (let frame = monoSamples.length - 1; frame >= 0; frame -= 1) {
    if (Math.abs(monoSamples[frame]) >= activityThreshold) {
      lastActiveSample = frame
      break
    }
  }

  const crossingStart = Math.floor(sampleRate * 0.1)
  const crossingEnd = Math.min(monoSamples.length, Math.floor(sampleRate * 0.35))
  let analysisCrossings = 0
  for (let frame = crossingStart + 1; frame < crossingEnd; frame += 1) {
    if (
      (monoSamples[frame - 1] < 0 && monoSamples[frame] >= 0) ||
      (monoSamples[frame - 1] >= 0 && monoSamples[frame] < 0)
    ) {
      analysisCrossings += 1
    }
  }
  const crossingDuration = Math.max(
    1 / sampleRate,
    (crossingEnd - crossingStart) / sampleRate,
  )

  return {
    ...blockMetrics,
    activeDurationSeconds: peak === 0 ? 0 : lastActiveSample / sampleRate,
    highFrequencyEnergy: monoSumSquares === 0 ? 0 : differenceSquared / monoSumSquares,
    nonFiniteSamples,
    peak,
    rms: Math.sqrt(sumSquares / (left.length * 2)),
    spectralCentroidHz: spectralCentroid(monoSamples, sampleRate),
    stereoDifferenceRms: Math.sqrt(stereoDifferenceSquared / Math.max(1, monoSamples.length)),
    tailCrestFactor: tailRms === 0 ? 0 : tailPeak / tailRms,
    tailRms,
    zeroCrossingHz: analysisCrossings / (2 * crossingDuration),
    zeroCrossings,
  }
}

function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  const fftSize = 4_096
  if (samples.length < fftSize) return 0

  let bestStart = 0
  let bestEnergy = -1
  const searchEnd = Math.min(samples.length - fftSize, Math.floor(sampleRate * 2))
  for (let start = 0; start <= searchEnd; start += 1_024) {
    let energy = 0
    for (let index = 0; index < fftSize; index += 8) {
      const sample = samples[start + index]
      energy += sample * sample
    }
    if (energy > bestEnergy) {
      bestEnergy = energy
      bestStart = start
    }
  }
  if (bestEnergy <= 0) return 0

  const real = new Float64Array(fftSize)
  const imaginary = new Float64Array(fftSize)
  for (let index = 0; index < fftSize; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1))
    real[index] = samples[bestStart + index] * window
  }
  fft(real, imaginary)

  let weightedFrequency = 0
  let magnitudeSum = 0
  for (let bin = 1; bin < fftSize / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin], imaginary[bin])
    magnitudeSum += magnitude
    weightedFrequency += magnitude * ((bin * sampleRate) / fftSize)
  }
  return magnitudeSum === 0 ? 0 : weightedFrequency / magnitudeSum
}

function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1
    while ((reversed & bit) !== 0) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit
    if (index < reversed) {
      const realValue = real[index]
      const imaginaryValue = imaginary[index]
      real[index] = real[reversed]
      imaginary[index] = imaginary[reversed]
      real[reversed] = realValue
      imaginary[reversed] = imaginaryValue
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1
      let twiddleImaginary = 0
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset
        const odd = even + length / 2
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal
        real[odd] = real[even] - oddReal
        imaginary[odd] = imaginary[even] - oddImaginary
        real[even] += oddReal
        imaginary[even] += oddImaginary

        const nextTwiddleReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal
        twiddleReal = nextTwiddleReal
      }
    }
  }
}
