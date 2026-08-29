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
  audibleBlocks: number
  nonFiniteSamples: number
  peak: number
  renderDurationMs: number
  rms: number
  silentBlocks: number
  unexpectedSilentHoldBlocks: number
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
  const metrics = measureStereo(left, right, {
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

function measureStereo(
  left: Float32Array,
  right: Float32Array,
  blockMetrics: Pick<
    VitalOfflineMetrics,
    'audibleBlocks' | 'renderDurationMs' | 'silentBlocks' | 'unexpectedSilentHoldBlocks'
  >,
): VitalOfflineMetrics {
  let nonFiniteSamples = 0
  let peak = 0
  let sumSquares = 0
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

    const mono = (leftSample + rightSample) * 0.5
    if (mono !== 0) {
      if (hasPreviousMono && Math.sign(mono) !== Math.sign(previousMono)) zeroCrossings += 1
      previousMono = mono
      hasPreviousMono = true
    }
  }

  return {
    ...blockMetrics,
    nonFiniteSamples,
    peak,
    rms: Math.sqrt(sumSquares / (left.length * 2)),
    zeroCrossings,
  }
}
