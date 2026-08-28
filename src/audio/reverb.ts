import type { ReverbState } from '../patch/types'
import { cancelAndHoldAudioParam } from './envelope'

type EffectsAudioContext = AudioContext | OfflineAudioContext

export interface ReverbSendGains {
  dry: 1
  wet: number
}

export function reverbSendGains(state: ReverbState): ReverbSendGains {
  return { dry: 1, wet: state.enabled ? state.mix : 0 }
}

function deterministicNoise(index: number, channel: number): number {
  let value = (index + 1) * 1_664_525 + (channel + 1) * 1_013_904_223
  value = (value ^ (value >>> 16)) >>> 0
  return (value / 0xffffffff) * 2 - 1
}

export function createReverbImpulse(
  context: BaseAudioContext,
  decaySeconds: number,
  size: number,
): AudioBuffer {
  const normalizedSize = Math.max(0, Math.min(1, size))
  const duration = Math.max(0.08, Math.min(8, decaySeconds * (0.55 + normalizedSize * 0.45)))
  const length = Math.max(1, Math.ceil(context.sampleRate * duration))
  const buffer = context.createBuffer(2, length, context.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      const progress = index / Math.max(1, length - 1)
      const envelope = (1 - progress) ** (1.4 + (1 - normalizedSize) * 2.6)
      data[index] = deterministicNoise(index, channel) * envelope * 0.42
    }
  }
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

    this.input.connect(this.dry).connect(this.output)
    this.input.connect(this.convolver).connect(this.wet).connect(this.output)
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
    const apply = smoothChanges
      ? smooth
      : (parameter: AudioParam, value: number, atTime: number) =>
          parameter.setValueAtTime(value, atTime)
    apply(this.dry.gain, mix.dry, time)
    apply(this.wet.gain, mix.wet, time)
  }
}
