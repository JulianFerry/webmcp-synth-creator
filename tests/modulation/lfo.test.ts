import { describe, expect, it } from 'vitest'

import {
  evaluateEnvelope,
  evaluateLfo,
  evaluateLfoPoints,
  lfoRateHz,
  syncDivisionSeconds,
  wrapPhase,
} from '../../src/audio/lfo'
import { parseSetLfoShapeCommand } from '../../src/patch/schemas'
import type { EnvelopeState, LfoState } from '../../src/patch/types'

describe('point LFO evaluation', () => {
  it('validates normalized, ordered shapes with two to thirty-two points', () => {
    expect(
      parseSetLfoShapeCommand({
        type: 'set_lfo_shape',
        reason: 'Create a pulse',
        points: [
          { x: 0, y: 0 },
          { x: 0.25, y: 1, power: 0.4 },
          { x: 1, y: 0 },
        ],
      }).points,
    ).toHaveLength(3)

    for (const points of [
      [{ x: 0, y: 0 }],
      [
        { x: 0.5, y: 0 },
        { x: 0.25, y: 1 },
      ],
      [
        { x: 0, y: -0.01 },
        { x: 1, y: 1 },
      ],
    ]) {
      expect(() =>
        parseSetLfoShapeCommand({
          type: 'set_lfo_shape',
          reason: 'Reject an invalid shape',
          points,
        }),
      ).toThrow()
    }
  })

  it('applies power curves and optional smoothing deterministically', () => {
    const linear = [
      { x: 0, y: 0, power: 0 },
      { x: 1, y: 1 },
    ]
    const positivePower = [
      { x: 0, y: 0, power: 0.5 },
      { x: 1, y: 1 },
    ]
    const negativePower = [
      { x: 0, y: 0, power: -0.5 },
      { x: 1, y: 1 },
    ]

    expect(evaluateLfoPoints(linear, 0.5)).toBeCloseTo(0.5)
    expect(evaluateLfoPoints(positivePower, 0.5)).toBeLessThan(0.5)
    expect(evaluateLfoPoints(negativePower, 0.5)).toBeGreaterThan(0.5)
    expect(evaluateLfoPoints(linear, 0.25, true)).toBeCloseTo(0.1464466)
  })

  it.each([
    ['1/1', 2],
    ['1/2', 1],
    ['1/4', 0.5],
    ['1/8', 0.25],
    ['1/8T', 1 / 6],
    ['1/16', 0.125],
    ['1/16T', 1 / 12],
    ['1/32', 0.0625],
    ['1/64', 0.03125],
  ] as const)('maps synchronized division %s to %s seconds at 120 BPM', (division, expected) => {
    expect(syncDivisionSeconds(division, 120)).toBeCloseTo(expected)
  })

  it('maps free rates, wraps phase, and evaluates phase offsets', () => {
    expect(lfoRateHz({ mode: 'sync', division: '1/8' }, 120)).toBe(4)
    expect(lfoRateHz({ mode: 'sync', division: '1/8T' }, 120)).toBe(6)
    expect(lfoRateHz({ mode: 'free', hz: 3.25 }, 120)).toBe(3.25)
    expect(wrapPhase(-0.25)).toBe(0.75)
    expect(wrapPhase(2.25)).toBe(0.25)

    const lfo: LfoState = {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      rate: { mode: 'free', hz: 1 },
      phase: 0.75,
      smooth: false,
      smoothing: 1.5 / 14,
      target: 'position',
      scope: 'all',
      depth: 0.5,
    }
    expect(evaluateLfo(lfo, 0.5)).toBeCloseTo(0.25)
  })
})

describe('modulation envelope evaluation', () => {
  const envelope: EnvelopeState = {
    delaySeconds: 0,
    attackSeconds: 0.2,
    holdSeconds: 0.1,
    decaySeconds: 0.4,
    sustainLevel: 0.25,
    releaseSeconds: 0.5,
    attackCurve: 0,
    decayCurve: -0.1,
    releaseCurve: -0.1,
  }

  it('evaluates attack, hold, decay, sustain, and release phases', () => {
    expect(evaluateEnvelope(envelope, 0.1)).toBeCloseTo(0.5)
    expect(evaluateEnvelope(envelope, 0.25)).toBe(1)
    expect(evaluateEnvelope(envelope, 0.5)).toBeCloseTo(0.451706)
    expect(evaluateEnvelope(envelope, 1)).toBe(0.25)
    expect(
      evaluateEnvelope(envelope, 1.25, { elapsedSeconds: 1, startValue: 0.25 }),
    ).toBeCloseTo(0.067235)
  })
})
