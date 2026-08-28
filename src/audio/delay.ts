import type { DelayState } from '../patch/types'
import { cancelAndHoldAudioParam } from './envelope'
import { DEFAULT_TEMPO_BPM, syncDivisionSeconds } from './lfo'

type EffectsAudioContext = AudioContext | OfflineAudioContext

export interface EffectMixGains {
  dry: number
  wet: number
}

export function delayInsertMixGains(state: DelayState): EffectMixGains {
  const wet = state.enabled ? state.mix : 0
  return { dry: 1 - wet, wet }
}

export function delayTimeSeconds(
  delay: DelayState,
  bpm = DEFAULT_TEMPO_BPM,
): number {
  if (delay.mode === 'free') return Math.max(0, Math.min(4, delay.timeSeconds ?? 0.25))
  return syncDivisionSeconds(delay.division ?? '1/8', bpm)
}

function smooth(parameter: AudioParam, value: number, time: number): void {
  cancelAndHoldAudioParam(parameter, time)
  parameter.linearRampToValueAtTime(value, time + 0.02)
}

export class DelayEffect {
  readonly input: GainNode
  readonly output: GainNode
  private readonly delay: DelayNode
  private readonly dry: GainNode
  private readonly wet: GainNode
  private readonly feedback: GainNode

  constructor(
    private readonly context: EffectsAudioContext,
    state: DelayState,
    private readonly bpm = DEFAULT_TEMPO_BPM,
  ) {
    this.input = context.createGain()
    this.output = context.createGain()
    this.delay = context.createDelay(4)
    this.dry = context.createGain()
    this.wet = context.createGain()
    this.feedback = context.createGain()

    this.input.connect(this.dry).connect(this.output)
    this.input.connect(this.delay).connect(this.wet).connect(this.output)
    this.delay.connect(this.feedback).connect(this.delay)
    this.applyState(state, context.currentTime, false)
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  applyState(state: DelayState, time: number, smoothChanges = true): void {
    const mix = delayInsertMixGains(state)
    const feedback = state.enabled ? Math.min(0.95, state.feedback) : 0
    const apply = smoothChanges
      ? smooth
      : (parameter: AudioParam, value: number, atTime: number) =>
          parameter.setValueAtTime(value, atTime)
    apply(this.delay.delayTime, delayTimeSeconds(state, this.bpm), time)
    apply(this.feedback.gain, feedback, time)
    apply(this.dry.gain, mix.dry, time)
    apply(this.wet.gain, mix.wet, time)
  }
}
