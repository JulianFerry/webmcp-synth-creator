import { describe, expect, it } from 'vitest'

import {
  cancelAndHoldAudioParam,
  getEnvelopeSchedule,
  scheduleEnvelopeAttack,
  scheduleEnvelopeRelease,
  updateEnvelopeAttack,
} from '../../src/audio/envelope'
import { getFilterNodeValues, resonanceToQ } from '../../src/audio/filter'
import type { EnvelopeState, FilterState } from '../../src/patch/types'

type AutomationCall = [method: string, valueOrTime: number, time?: number]

class FakeAudioParam {
  value = 0.4
  readonly calls: AutomationCall[] = []

  cancelAndHoldAtTime(time: number): void {
    this.calls.push(['cancelAndHoldAtTime', time])
  }

  cancelScheduledValues(time: number): void {
    this.calls.push(['cancelScheduledValues', time])
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push(['setValueAtTime', value, time])
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push(['linearRampToValueAtTime', value, time])
  }
}

const envelope: EnvelopeState = {
  attackSeconds: 0.1,
  holdSeconds: 0.05,
  decaySeconds: 0.2,
  sustainLevel: 0.6,
  releaseSeconds: 0.3,
}

describe('envelope scheduling', () => {
  it('derives attack, hold, decay, and sustain values from logical seconds', () => {
    expect(getEnvelopeSchedule(envelope, 2, 0.8)).toEqual({
      attackEnd: 2.1,
      holdEnd: 2.15,
      decayEnd: 2.35,
      sustainGain: 0.48,
    })
  })

  it('uses cancel-and-hold before scheduling a complete attack envelope', () => {
    const parameter = new FakeAudioParam()
    scheduleEnvelopeAttack(parameter as unknown as AudioParam, envelope, 2, 0.8)

    expect(parameter.calls).toEqual([
      ['cancelAndHoldAtTime', 2],
      ['setValueAtTime', 0, 2],
      ['linearRampToValueAtTime', 0.8, 2.1],
      ['setValueAtTime', 0.8, 2.15],
      ['linearRampToValueAtTime', 0.48, 2.35],
    ])
  })

  it('falls back to a held value and enforces a click-safe minimum release', () => {
    const parameter = new FakeAudioParam()
    ;(parameter as { cancelAndHoldAtTime?: unknown }).cancelAndHoldAtTime = undefined

    cancelAndHoldAudioParam(parameter as unknown as AudioParam, 4)
    expect(parameter.calls).toEqual([
      ['cancelScheduledValues', 4],
      ['setValueAtTime', 0.4, 4],
    ])

    const releaseEnd = scheduleEnvelopeRelease(parameter as unknown as AudioParam, 0, 4)
    expect(releaseEnd).toBe(4.005)
    expect(parameter.calls.at(-1)).toEqual(['linearRampToValueAtTime', 0, 4.005])
  })

  it('recontours an in-progress attack from its held gain without restarting at zero', () => {
    const parameter = new FakeAudioParam()
    const schedule = updateEnvelopeAttack(parameter as unknown as AudioParam, envelope, 2)

    expect(schedule.attackEnd).toBe(2.1)
    expect(parameter.calls).toEqual([
      ['cancelAndHoldAtTime', 2],
      ['linearRampToValueAtTime', 1, 2.1],
      ['setValueAtTime', 1, 2.15],
      ['linearRampToValueAtTime', 0.6, 2.35],
    ])
  })
})

describe('filter conversion', () => {
  const filter: FilterState = {
    enabled: true,
    type: 'bandpass',
    cutoffHz: 18_000,
    resonance: 0.5,
  }

  it('maps resonance nonlinearly into a stable Q range', () => {
    expect(resonanceToQ(0)).toBe(0.0001)
    expect(resonanceToQ(0.5)).toBeCloseTo(6.0001, 8)
    expect(resonanceToQ(1)).toBeCloseTo(24.0001, 8)
  })

  it('clamps cutoff below Nyquist and bypasses disabled filters', () => {
    expect(getFilterNodeValues(filter, 24_000)).toEqual({
      type: 'bandpass',
      frequencyHz: 11_760,
      q: resonanceToQ(0.5),
    })
    expect(getFilterNodeValues({ ...filter, enabled: false }, 48_000)).toEqual({
      type: 'lowpass',
      frequencyHz: 20_000,
      q: 0.0001,
    })
  })

  it('passes notch through to the browser biquad mode', () => {
    expect(getFilterNodeValues({ ...filter, type: 'notch' })).toMatchObject({
      type: 'notch',
    })
  })
})
