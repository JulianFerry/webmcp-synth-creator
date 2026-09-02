import { describe, expect, it } from 'vitest'

import { TEMPO_SYNC_DIVISIONS } from '../../src/patch/limits'
import type { EnvelopeState } from '../../src/patch/types'
import {
  cutoffHzToNormalized,
  glideSecondsToNormalized,
  lfoDivisionToNormalized,
  lfoHzToNormalized,
  normalizedToCutoffHz,
  normalizedToGlideSeconds,
  normalizedToLfoDivision,
  normalizedToLfoHz,
  normalizedToReverbDecaySeconds,
  reverbDecaySecondsToNormalized,
  scaleEnvelopeTimes,
} from '../../src/ops/normalization'

const SAMPLES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]

function expectMonotonic(values: number[]): void {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeGreaterThanOrEqual(values[index - 1])
  }
}

describe('normalized unit bridge', () => {
  it('maps cutoff monotonically and round-trips within MIDI rounding tolerance', () => {
    expectMonotonic(SAMPLES.map(normalizedToCutoffHz))
    for (const normalized of SAMPLES) {
      expect(cutoffHzToNormalized(normalizedToCutoffHz(normalized))).toBeCloseTo(normalized, 2)
    }
    expect(normalizedToCutoffHz(0.12)).toBe(32)
    expect(normalizedToCutoffHz(0.92)).toBe(11_677)
  })

  it('maps reverb decay logarithmically, monotonically, and reversibly', () => {
    expectMonotonic(SAMPLES.map(normalizedToReverbDecaySeconds))
    for (const normalized of SAMPLES) {
      expect(reverbDecaySecondsToNormalized(normalizedToReverbDecaySeconds(normalized))).toBeCloseTo(normalized, 10)
    }
  })

  it('maps glide monotonically and reversibly, preserving off at zero', () => {
    expectMonotonic(SAMPLES.map(normalizedToGlideSeconds))
    for (const normalized of SAMPLES) {
      expect(glideSecondsToNormalized(normalizedToGlideSeconds(normalized))).toBeCloseTo(normalized, 10)
    }
    expect(normalizedToGlideSeconds(0)).toBe(0)
  })

  it('selects tempo divisions monotonically and round-trips ladder positions', () => {
    const indices = SAMPLES.map((value) => TEMPO_SYNC_DIVISIONS.indexOf(normalizedToLfoDivision(value)))
    expectMonotonic(indices)
    expect(normalizedToLfoDivision(0)).toBe('1/1')
    expect(normalizedToLfoDivision(0.25)).toBe('1/1')
    expect(lfoDivisionToNormalized('1/1')).toBe(0.25)
    for (const division of TEMPO_SYNC_DIVISIONS) {
      expect(normalizedToLfoDivision(lfoDivisionToNormalized(division))).toBe(division)
    }
  })

  it('maps free LFO rates logarithmically, monotonically, and reversibly', () => {
    expectMonotonic(SAMPLES.map(normalizedToLfoHz))
    for (const normalized of SAMPLES) {
      expect(lfoHzToNormalized(normalizedToLfoHz(normalized))).toBeCloseTo(normalized, 10)
    }
  })

  it('scales every envelope time monotonically without changing other fields', () => {
    const envelope: EnvelopeState = {
      delaySeconds: 0.1,
      attackSeconds: 0.2,
      holdSeconds: 0.3,
      decaySeconds: 0.4,
      sustainLevel: 0.5,
      releaseSeconds: 0.6,
      attackCurve: 0.1,
      decayCurve: -0.2,
      releaseCurve: 0.3,
    }
    const scaled = SAMPLES.map((speed) => scaleEnvelopeTimes(envelope, speed))
    expectMonotonic(scaled.map(({ attackSeconds }) => attackSeconds))
    expect(scaled[0].attackSeconds).toBeCloseTo(0.05)
    expect(scaled.at(-1)?.attackSeconds).toBeCloseTo(0.35)
    expect(scaled[3]).toMatchObject({ sustainLevel: 0.5, attackCurve: 0.1, decayCurve: -0.2, releaseCurve: 0.3 })
  })

  it('rejects values outside each declared domain', () => {
    expect(() => normalizedToCutoffHz(-0.01)).toThrow(RangeError)
    expect(() => reverbDecaySecondsToNormalized(21)).toThrow(RangeError)
    expect(() => glideSecondsToNormalized(-1)).toThrow(RangeError)
    expect(() => normalizedToLfoHz(1.01)).toThrow(RangeError)
    expect(() => lfoHzToNormalized(50)).toThrow(RangeError)
  })
})
