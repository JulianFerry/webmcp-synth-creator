import { describe, expect, it } from 'vitest'

import {
  cancelAndHoldAudioParam,
  createVitalAmplitudeCurve,
  getEnvelopeSchedule,
  scheduleEnvelopeAttack,
  scheduleEnvelopeRelease,
  updateEnvelopeAttack,
} from '../../src/audio/envelope'
import { getFilterNodeValues, resonanceToQ } from '../../src/audio/filter'
import type { EnvelopeState, FilterState } from '../../src/patch/types'

type AutomationCall = [method: string, valueOrTime: number, time?: number, duration?: number]

class FakeAudioParam {
  value = 0.4
  readonly calls: AutomationCall[] = []
  readonly curves: Float32Array[] = []

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

  setValueCurveAtTime(values: Float32Array, time: number, duration: number): void {
    this.curves.push(values)
    this.value = values.at(-1) ?? this.value
    this.calls.push(['setValueCurveAtTime', this.value, time, duration])
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
      sustainGain: 0.288,
    })
  })

  it('squares Vital envelope 1 into the final voice gain', () => {
    const curve = createVitalAmplitudeCurve(0, 1, 0, 101)

    expect(curve[0]).toBe(0)
    expect(curve[6]).toBeCloseTo(0.0036, 6)
    expect(curve[50]).toBeCloseTo(0.25, 6)
    expect(curve[100]).toBe(1)
  })

  it('uses cancel-and-hold before scheduling a complete attack envelope', () => {
    const parameter = new FakeAudioParam()
    scheduleEnvelopeAttack(parameter as unknown as AudioParam, envelope, 2, 0.8)

    expect(parameter.calls.slice(0, 3)).toEqual([
      ['cancelAndHoldAtTime', 2],
      ['setValueAtTime', 0, 2],
      ['setValueAtTime', 0, 2],
    ])
    expect(parameter.calls).toContainEqual([
      'linearRampToValueAtTime',
      0.800000011920929,
      2.1,
    ])
    expect(parameter.calls).toContainEqual([
      'setValueAtTime',
      0.800000011920929,
      2.15,
    ])
    expect(parameter.calls.at(-1)).toEqual([
      'linearRampToValueAtTime',
      0.2880000174045563,
      2.35,
    ])
    expect(parameter.curves).toEqual([])
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
    expect(parameter.calls.at(-1)?.[0]).toBe('linearRampToValueAtTime')
    expect(parameter.calls.at(-1)?.[1]).toBe(0)
    expect(parameter.calls.at(-1)?.[2]).toBeCloseTo(4.005, 12)
    expect(parameter.curves).toEqual([])
  })

  it('recontours an in-progress attack from its held gain without restarting at zero', () => {
    const parameter = new FakeAudioParam()
    const schedule = updateEnvelopeAttack(parameter as unknown as AudioParam, envelope, 2)

    expect(schedule.attackEnd).toBe(2.1)
    expect(parameter.calls.slice(0, 2)).toEqual([
      ['cancelAndHoldAtTime', 2],
      ['setValueAtTime', 0.4000000059604645, 2],
    ])
    expect(parameter.calls).toContainEqual(['linearRampToValueAtTime', 1, 2.1])
    expect(parameter.calls).toContainEqual(['setValueAtTime', 1, 2.15])
    expect(parameter.calls.at(-1)).toEqual([
      'linearRampToValueAtTime',
      0.36000001430511475,
      2.35,
    ])
    expect(parameter.curves).toEqual([])
  })
})

describe('filter conversion', () => {
  const filter: FilterState = {
    enabled: true,
    type: 'bandpass',
    cutoffHz: 18_000,
    resonance: 0.5,
  }

  it('maps low/high-pass resonance to Web Audio decibels without hiding low settings', () => {
    expect(resonanceToQ(0)).toBe(0.0001)
    expect(resonanceToQ(0.12)).toBeCloseTo(2.8801, 8)
    expect(resonanceToQ(0.5)).toBeCloseTo(12.0001, 8)
    expect(resonanceToQ(1)).toBeCloseTo(24.0001, 8)
    expect(resonanceToQ(0.5, 'bandpass')).toBeCloseTo(6.0001, 8)
  })

  it('clamps cutoff below Nyquist and bypasses disabled filters', () => {
    expect(getFilterNodeValues(filter, 24_000)).toEqual({
      type: 'bandpass',
      frequencyHz: 11_760,
      q: resonanceToQ(0.5, 'bandpass'),
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
