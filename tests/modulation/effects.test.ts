import { describe, expect, it } from 'vitest'

import { DelayEffect, delayTimeSeconds } from '../../src/audio/delay'
import { createReverbImpulse, ReverbEffect } from '../../src/audio/reverb'
import { createDefaultPatch } from '../../src/patch/defaults'
import { FakeAudioContext } from '../audio/fakes'

function sampleEnergy(samples: Float32Array, start = 0, end = samples.length): number {
  let total = 0
  for (let index = start; index < end; index += 1) total += samples[index] ** 2
  return total
}

function channelCorrelation(left: Float32Array, right: Float32Array): number {
  let product = 0
  for (let index = 0; index < left.length; index += 1) {
    product += left[index] * right[index]
  }
  return product / Math.sqrt(sampleEnergy(left) * sampleEnergy(right))
}

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

  it('creates a controlled pre-delay, balanced stereo energy, and a decaying tail', () => {
    const context = new FakeAudioContext()
    const impulse = createReverbImpulse(context.asAudioContext(), 2.4, 0.7)
    const left = impulse.getChannelData(0)
    const right = impulse.getChannelData(1)
    const firstArrival = left.findIndex((sample) => sample !== 0)
    const finalQuarter = Math.floor(left.length * 0.75)

    expect(firstArrival / context.sampleRate).toBeGreaterThan(0.015)
    expect(firstArrival / context.sampleRate).toBeLessThan(0.03)
    expect(sampleEnergy(left)).toBeGreaterThan(0.25)
    expect(sampleEnergy(left)).toBeLessThan(0.6)
    expect(sampleEnergy(left) / sampleEnergy(right)).toBeCloseTo(1, 1)
    expect(channelCorrelation(left, right)).toBeGreaterThan(0.12)
    expect(channelCorrelation(left, right)).toBeLessThan(0.45)
    expect(sampleEnergy(left, finalQuarter)).toBeLessThan(
      sampleEnergy(left, Math.floor(left.length * 0.5), finalQuarter) * 0.1,
    )
  })

  it('rebuilds the impulse when decay or size changes', () => {
    const patch = createDefaultPatch()
    const context = new FakeAudioContext()
    const effect = new ReverbEffect(context.asAudioContext(), patch.effects.reverb)
    const initial = context.convolvers[0].buffer
    expect(context.convolvers[0].normalize).toBe(false)
    expect(context.filters.map((filter) => filter.type)).toEqual([
      'highpass',
      'highshelf',
      'lowpass',
    ])
    expect(context.filters[1].frequency.value).toBeCloseTo(1_479.98)
    expect(context.filters[1].gain.value).toBe(-1)
    expect(context.filters[2].frequency.value).toBeCloseTo(4_698.64)
    effect.applyState({ ...patch.effects.reverb, decaySeconds: 1.1 }, 0)
    expect(context.convolvers[0].buffer).not.toBe(initial)
  })
})
