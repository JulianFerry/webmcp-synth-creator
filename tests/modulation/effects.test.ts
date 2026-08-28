import { describe, expect, it } from 'vitest'

import { DelayEffect, delayTimeSeconds } from '../../src/audio/delay'
import { createReverbImpulse, ReverbEffect } from '../../src/audio/reverb'
import { createDefaultPatch } from '../../src/patch/defaults'
import { FakeAudioContext } from '../audio/fakes'

describe('delay effect', () => {
  it('converts synchronized and free delay times and applies a feedback network', () => {
    const patch = createDefaultPatch()
    expect(delayTimeSeconds(patch.effects.delay, 120)).toBe(0.25)
    expect(
      delayTimeSeconds(
        {
          ...patch.effects.delay,
          mode: 'sync',
          division: '1/8T',
        },
        120,
      ),
    ).toBeCloseTo(1 / 6)
    expect(
      delayTimeSeconds({ ...patch.effects.delay, mode: 'free', timeSeconds: 0.37 }),
    ).toBe(0.37)

    const context = new FakeAudioContext()
    const effect = new DelayEffect(context.asAudioContext(), patch.effects.delay)
    expect(effect.input).toBeTruthy()
    expect(context.delays).toHaveLength(1)
    expect(context.delays[0].delayTime.value).toBe(0.25)
  })
})

describe('reverb effect', () => {
  it('generates the same deterministic stereo impulse for the same state', () => {
    const firstContext = new FakeAudioContext()
    const secondContext = new FakeAudioContext()
    const first = createReverbImpulse(firstContext.asAudioContext(), 1.2, 0.7)
    const second = createReverbImpulse(secondContext.asAudioContext(), 1.2, 0.7)

    expect(first.length).toBe(second.length)
    expect(Array.from(first.getChannelData(0).slice(0, 64))).toEqual(
      Array.from(second.getChannelData(0).slice(0, 64)),
    )
    expect(first.getChannelData(0)).not.toEqual(first.getChannelData(1))
  })

  it('rebuilds the impulse when decay or size changes', () => {
    const patch = createDefaultPatch()
    const context = new FakeAudioContext()
    const effect = new ReverbEffect(context.asAudioContext(), patch.effects.reverb)
    const initial = context.convolvers[0].buffer
    effect.applyState({ ...patch.effects.reverb, decaySeconds: 1.1 }, 0)
    expect(context.convolvers[0].buffer).not.toBe(initial)
  })
})
