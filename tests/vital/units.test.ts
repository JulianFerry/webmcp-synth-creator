import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  decodeVitalDelaySeconds,
  decodeVitalChorusRate,
  decodeVitalEnvelopeCurve,
  decodeVitalFilterDrive,
  decodeVitalLfoSmoothing,
  decodeVitalReverbPredelay,
  decodeVitalEnvelopeSeconds,
  decodeVitalOscillatorLevel,
  decodeVitalReverbDecaySeconds,
  decodeVitalUnisonDetune,
  encodeVitalDelaySeconds,
  encodeVitalChorusRate,
  encodeVitalEnvelopeCurve,
  encodeVitalFilterDrive,
  encodeVitalLfoSmoothing,
  encodeVitalReverbPredelay,
  encodeVitalEnvelopeSeconds,
  encodeVitalOscillatorLevel,
  encodeVitalReverbDecaySeconds,
  encodeVitalUnisonDetune,
} from '../../src/vital/units'

describe('Vital 1.0.7 parameter conversions', () => {
  it('round-trips linear oscillator level through Vital quadratic storage', () => {
    expect(encodeVitalOscillatorLevel(0.71)).toBeCloseTo(Math.sqrt(0.71 * 0.5))
    expect(encodeVitalOscillatorLevel(0.71) ** 2).toBeCloseTo(0.355)
    expect(decodeVitalOscillatorLevel(encodeVitalOscillatorLevel(0.71))).toBeCloseTo(0.71)
    expect(encodeVitalOscillatorLevel(1)).toBeCloseTo(Math.SQRT1_2)
    expect(decodeVitalOscillatorLevel(Math.SQRT1_2)).toBeCloseTo(1)
  })

  it('round-trips the workbench detune range through Vital quadratic storage', () => {
    expect(encodeVitalUnisonDetune(0.25)).toBeCloseTo(Math.sqrt(3))
    expect(encodeVitalUnisonDetune(0.25) ** 2).toBeCloseTo(3)
    expect(decodeVitalUnisonDetune(encodeVitalUnisonDetune(0.25))).toBeCloseTo(0.25)
    expect(encodeVitalUnisonDetune(1)).toBeCloseTo(Math.sqrt(12))
    expect(decodeVitalUnisonDetune(Math.sqrt(12))).toBeCloseTo(1)
  })

  it.each([
    ['attack', 0],
    ['attack', 0.18],
    ['decay', 1],
    ['decay', 10],
    ['release', 20],
    ['hold', 4],
  ] as const)('round-trips %s envelope time at %s seconds through quartic storage', (field, seconds) => {
    expect(decodeVitalEnvelopeSeconds(encodeVitalEnvelopeSeconds(seconds, field))).toBeCloseTo(
      seconds,
      10,
    )
  })

  it.each([1 / 512, 0.125, 0.25, 1, 4])(
    'round-trips free delay time %s seconds through reciprocal log2 frequency storage',
    (seconds) => {
      expect(decodeVitalDelaySeconds(encodeVitalDelaySeconds(seconds))).toBeCloseTo(seconds, 10)
    },
  )

  it.each([1 / 64, 0.5, 1, 4, 20])(
    'round-trips reverb decay %s seconds through log2 storage',
    (seconds) => {
      expect(
        decodeVitalReverbDecaySeconds(encodeVitalReverbDecaySeconds(seconds)),
      ).toBeCloseTo(seconds, 10)
    },
  )

  it('decodes representative values from the real Init fixture', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as { settings: Record<string, number> }

    expect(decodeVitalEnvelopeSeconds(fixture.settings.env_1_attack)).toBeCloseTo(0.0005, 4)
    expect(decodeVitalEnvelopeSeconds(fixture.settings.env_1_decay)).toBe(1)
    expect(decodeVitalEnvelopeSeconds(fixture.settings.env_1_release)).toBeCloseTo(0.09, 3)
    expect(decodeVitalDelaySeconds(fixture.settings.delay_frequency)).toBe(0.25)
    expect(decodeVitalReverbDecaySeconds(fixture.settings.reverb_decay_time)).toBe(1)
  })

  it('rejects values outside the proven Vital parameter ranges', () => {
    expect(() => encodeVitalEnvelopeSeconds(4.01, 'hold')).toThrow(RangeError)
    expect(() => encodeVitalDelaySeconds(0)).toThrow(RangeError)
    expect(() => encodeVitalDelaySeconds(4.01)).toThrow(RangeError)
    expect(() => encodeVitalReverbDecaySeconds(0)).toThrow(RangeError)
    expect(() => encodeVitalOscillatorLevel(1.01)).toThrow(RangeError)
    expect(() => decodeVitalOscillatorLevel(-0.01)).toThrow(RangeError)
    expect(() => decodeVitalOscillatorLevel(1)).toThrow(/exceeds the workbench 100%/)
    expect(() => encodeVitalUnisonDetune(1.01)).toThrow(RangeError)
    expect(() => decodeVitalUnisonDetune(Math.sqrt(12.01))).toThrow(
      /exceeds the workbench 100%/,
    )
  })

  it.each([
    [encodeVitalEnvelopeCurve, decodeVitalEnvelopeCurve, -0.6],
    [encodeVitalFilterDrive, decodeVitalFilterDrive, 0.7],
    [encodeVitalChorusRate, decodeVitalChorusRate, 0.35],
    [encodeVitalReverbPredelay, decodeVitalReverbPredelay, 0.12],
    [encodeVitalLfoSmoothing, decodeVitalLfoSmoothing, 0.4],
  ] as const)('round-trips a Phase 3 scalar conversion', (encode, decode, value) => {
    expect(decode(encode(value))).toBeCloseTo(value, 10)
  })
})
