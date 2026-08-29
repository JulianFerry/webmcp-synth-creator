import type { ReverbState } from '../patch/types'
import { cancelAndHoldAudioParam } from './envelope'
import { equalPowerMix } from './units'

type EffectsAudioContext = AudioContext | OfflineAudioContext

export interface ReverbSendGains {
  dry: number
  wet: number
}

export function reverbSendGains(state: ReverbState): ReverbSendGains {
  return equalPowerMix(state.enabled ? state.mix : 0)
}

const MAX_IMPULSE_SECONDS = 8
const MIN_IMPULSE_SECONDS = 0.12
// Tonal calibration only: these are Vital's default reverb filter settings,
// applied to this independently designed convolution reverb.
const REVERB_HIGH_CUT_HZ = 4_698.64
const REVERB_HIGH_SHELF_HZ = 1_479.98
const REVERB_HIGH_SHELF_GAIN_DB = -1

interface ReverbImpulseShape {
  durationSeconds: number
  preDelaySeconds: number
  earlySpanSeconds: number
  tailStartSeconds: number
  dampingCutoffHz: number
  highFrequencyDecaySeconds: number
  earlyReflectionCount: number
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function reverbImpulseShape(
  decaySeconds: number,
  size: number,
  sampleRate: number,
): ReverbImpulseShape {
  const normalizedSize = clampUnit(size)
  const safeDecay = Math.max(0.1, decaySeconds)
  const preDelaySeconds = 0.003 + normalizedSize * 0.027
  const earlySpanSeconds = 0.022 + normalizedSize * 0.068

  return {
    durationSeconds: Math.max(
      MIN_IMPULSE_SECONDS,
      Math.min(
        MAX_IMPULSE_SECONDS,
        preDelaySeconds + Math.max(earlySpanSeconds, safeDecay * 0.94),
      ),
    ),
    preDelaySeconds,
    earlySpanSeconds,
    tailStartSeconds: preDelaySeconds + 0.004 + normalizedSize * 0.006,
    dampingCutoffHz: Math.min(sampleRate * 0.42, REVERB_HIGH_CUT_HZ),
    highFrequencyDecaySeconds: safeDecay * (0.56 - normalizedSize * 0.18),
    earlyReflectionCount: 18 + Math.round(normalizedSize * 18),
  }
}

function createNoise(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 0x80000000) - 1
  }
}

function constantPowerPan(pan: number): [left: number, right: number] {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4
  return [Math.cos(angle), Math.sin(angle)]
}

function energy(samples: Float32Array, start = 0): number {
  let total = 0
  for (let index = start; index < samples.length; index += 1) {
    total += samples[index] ** 2
  }
  return total
}

function scaleRange(
  samples: Float32Array,
  scale: number,
  start = 0,
): void {
  for (let index = start; index < samples.length; index += 1) {
    samples[index] *= scale
  }
}

function addEarlyReflections(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  shape: ReverbImpulseShape,
  size: number,
): void {
  const random = createNoise(0x8e21_6f3d)
  const width = 0.3 + clampUnit(size) * 0.42
  const startSample = Math.round(shape.preDelaySeconds * sampleRate)
  const spanSamples = shape.earlySpanSeconds * sampleRate

  // A centered first arrival preserves the source position. The following
  // low-discrepancy cluster becomes wider and denser as room size increases.
  const [firstLeft, firstRight] = constantPowerPan(0)
  left[startSample] += firstLeft
  right[startSample] += firstRight

  for (let reflection = 0; reflection < shape.earlyReflectionCount; reflection += 1) {
    const progress = (reflection + 1) / (shape.earlyReflectionCount + 1)
    const jitter = random() * (0.34 / shape.earlyReflectionCount)
    const reflectionSample = Math.min(
      left.length - 1,
      startSample + Math.round((progress + jitter) * spanSamples),
    )
    const pan = Math.sin((reflection + 1) * 2.399_963 + size) * width
    const [panLeft, panRight] = constantPowerPan(pan)
    const sign = random() < 0 ? -1 : 1
    const level = sign * (0.9 - progress * 0.55) * (0.82 + Math.abs(random()) * 0.28)
    const smearSamples = 1 + Math.round(clampUnit(size) * sampleRate * 0.000_12)

    for (let smear = 0; smear < smearSamples; smear += 1) {
      const index = reflectionSample + smear
      if (index >= left.length) break
      const smearGain = level * Math.exp(-smear / Math.max(1, smearSamples * 0.45))
      left[index] += smearGain * panLeft
      right[index] += smearGain * panRight
    }
  }

  const targetEnergy = 0.075 - clampUnit(size) * 0.025
  const combinedEnergy = (energy(left) + energy(right)) / 2
  if (combinedEnergy > 0) {
    const scale = Math.sqrt(targetEnergy / combinedEnergy)
    scaleRange(left, scale)
    scaleRange(right, scale)
  }
}

function addLateTail(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  decaySeconds: number,
  shape: ReverbImpulseShape,
  size: number,
): void {
  const sharedNoise = createNoise(0x6d2b_79f5)
  const leftNoise = createNoise(0xa511_e9b3)
  const rightNoise = createNoise(0x63d8_3595)
  const tailStart = Math.min(left.length - 1, Math.round(shape.tailStartSeconds * sampleRate))
  const lateLeft = new Float32Array(left.length - tailStart)
  const lateRight = new Float32Array(right.length - tailStart)
  const lowPassAmount = 1 - Math.exp((-2 * Math.PI * shape.dampingCutoffHz) / sampleRate)
  const safeDecay = Math.max(0.1, decaySeconds)
  const lowFrequencyDecaySeconds = safeDecay * 0.86
  const bloomSeconds = 0.012 + clampUnit(size) * 0.026
  let leftLow = 0
  let rightLow = 0

  for (let index = tailStart; index < left.length; index += 1) {
    const tailSeconds = (index - tailStart) / sampleRate
    const shared = sharedNoise()
    const leftInput = leftNoise() * 0.88 + shared * 0.45
    const rightInput = rightNoise() * 0.88 + shared * 0.45
    leftLow += lowPassAmount * (leftInput - leftLow)
    rightLow += lowPassAmount * (rightInput - rightLow)

    const lowEnvelope = 10 ** ((-3 * tailSeconds) / lowFrequencyDecaySeconds)
    const highEnvelope = 10 ** ((-3 * tailSeconds) / shape.highFrequencyDecaySeconds)
    const bloom = 1 - Math.exp(-tailSeconds / bloomSeconds)
    const leftHigh = leftInput - leftLow
    const rightHigh = rightInput - rightLow

    const tailIndex = index - tailStart
    lateLeft[tailIndex] = bloom * (leftLow * lowEnvelope + leftHigh * highEnvelope * 0.72)
    lateRight[tailIndex] = bloom * (rightLow * lowEnvelope + rightHigh * highEnvelope * 0.72)
  }

  const targetEnergy = 0.3 + clampUnit(size) * 0.1
  const leftEnergy = energy(lateLeft)
  const rightEnergy = energy(lateRight)
  const leftScale = leftEnergy > 0 ? Math.sqrt(targetEnergy / leftEnergy) : 0
  const rightScale = rightEnergy > 0 ? Math.sqrt(targetEnergy / rightEnergy) : 0
  for (let index = tailStart; index < left.length; index += 1) {
    const tailIndex = index - tailStart
    left[index] += lateLeft[tailIndex] * leftScale
    right[index] += lateRight[tailIndex] * rightScale
  }
}

export function createReverbImpulse(
  context: BaseAudioContext,
  decaySeconds: number,
  size: number,
): AudioBuffer {
  const shape = reverbImpulseShape(decaySeconds, size, context.sampleRate)
  const length = Math.max(1, Math.ceil(context.sampleRate * shape.durationSeconds))
  const buffer = context.createBuffer(2, length, context.sampleRate)
  const left = buffer.getChannelData(0)
  const right = buffer.getChannelData(1)

  addEarlyReflections(left, right, context.sampleRate, shape, size)
  addLateTail(left, right, context.sampleRate, decaySeconds, shape, size)
  return buffer
}

function smooth(parameter: AudioParam, value: number, time: number): void {
  cancelAndHoldAudioParam(parameter, time)
  parameter.linearRampToValueAtTime(value, time + 0.025)
}

export class ReverbEffect {
  readonly input: GainNode
  readonly output: GainNode
  private readonly convolver: ConvolverNode
  private readonly dry: GainNode
  private readonly wet: GainNode
  private readonly wetHighPass: BiquadFilterNode
  private readonly wetHighShelf: BiquadFilterNode
  private readonly wetLowPass: BiquadFilterNode
  private impulseSignature = ''

  constructor(
    private readonly context: EffectsAudioContext,
    state: ReverbState,
  ) {
    this.input = context.createGain()
    this.output = context.createGain()
    this.convolver = context.createConvolver()
    this.dry = context.createGain()
    this.wet = context.createGain()
    this.wetHighPass = context.createBiquadFilter()
    this.wetHighShelf = context.createBiquadFilter()
    this.wetLowPass = context.createBiquadFilter()

    this.convolver.normalize = false
    this.wetHighPass.type = 'highpass'
    this.wetHighPass.frequency.setValueAtTime(95, context.currentTime)
    this.wetHighPass.Q.setValueAtTime(0.65, context.currentTime)
    this.wetHighShelf.type = 'highshelf'
    this.wetHighShelf.frequency.setValueAtTime(REVERB_HIGH_SHELF_HZ, context.currentTime)
    this.wetHighShelf.gain.setValueAtTime(REVERB_HIGH_SHELF_GAIN_DB, context.currentTime)
    this.wetLowPass.type = 'lowpass'
    this.wetLowPass.Q.setValueAtTime(0.55, context.currentTime)

    this.input.connect(this.dry).connect(this.output)
    this.input
      .connect(this.convolver)
      .connect(this.wetHighPass)
      .connect(this.wetHighShelf)
      .connect(this.wetLowPass)
      .connect(this.wet)
      .connect(this.output)
    this.applyState(state, context.currentTime, false)
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  applyState(state: ReverbState, time: number, smoothChanges = true): void {
    const signature = `${state.decaySeconds}:${state.size}`
    if (signature !== this.impulseSignature) {
      this.convolver.buffer = createReverbImpulse(this.context, state.decaySeconds, state.size)
      this.impulseSignature = signature
    }
    const mix = reverbSendGains(state)
    const lowPassFrequency = Math.min(this.context.sampleRate * 0.42, REVERB_HIGH_CUT_HZ)
    const apply = smoothChanges
      ? smooth
      : (parameter: AudioParam, value: number, atTime: number) =>
          parameter.setValueAtTime(value, atTime)
    apply(this.dry.gain, mix.dry, time)
    apply(this.wet.gain, mix.wet, time)
    apply(this.wetLowPass.frequency, lowPassFrequency, time)
  }
}
