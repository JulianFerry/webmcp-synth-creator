import type { EffectId } from '../patch/effects'
import type { PatchState } from '../patch/types'
import { DelayEffect } from './delay'
import { applyFilterState } from './filter'
import { ReverbEffect } from './reverb'

type EffectsAudioContext = AudioContext | OfflineAudioContext

interface EffectStage {
  input: AudioNode
  output: AudioNode
}

function throughStage(context: EffectsAudioContext): EffectStage {
  const node = context.createGain()
  return { input: node, output: node }
}

export class AudioEffectsChain {
  readonly input: GainNode
  readonly output: GainNode
  readonly filter: BiquadFilterNode
  readonly delay: DelayEffect
  readonly reverb: ReverbEffect
  private readonly stages: Record<EffectId, EffectStage>
  private order: EffectId[]

  constructor(private readonly context: EffectsAudioContext, patch: PatchState) {
    this.input = context.createGain()
    this.output = context.createGain()
    this.filter = context.createBiquadFilter()
    this.delay = new DelayEffect(context, patch.effects.delay)
    this.reverb = new ReverbEffect(context, patch.effects.reverb)
    this.stages = {
      distortion: throughStage(context),
      filter: { input: this.filter, output: this.filter },
      compressor: throughStage(context),
      chorus: throughStage(context),
      delay: { input: this.delay.input, output: this.delay.output },
      reverb: { input: this.reverb.input, output: this.reverb.output },
    }
    this.order = [...patch.effects.order]
    applyFilterState(this.filter, patch.filter, context.currentTime)
    this.rebuild()
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  applyPatch(patch: PatchState, options: { filter: boolean; delay: boolean; reverb: boolean; order: boolean }): void {
    const now = this.context.currentTime
    if (options.filter) applyFilterState(this.filter, patch.filter, now, 0.015)
    if (options.delay) this.delay.applyState(patch.effects.delay, now)
    if (options.reverb) this.reverb.applyState(patch.effects.reverb, now)
    if (options.order) {
      this.order = [...patch.effects.order]
      this.rebuild()
    }
  }

  private rebuild(): void {
    this.input.disconnect()
    Object.values(this.stages).forEach((stage) => stage.output.disconnect())

    let source: AudioNode = this.input
    this.order.forEach((effectId) => {
      const stage = this.stages[effectId]
      source.connect(stage.input)
      source = stage.output
    })
    source.connect(this.output)
  }
}
