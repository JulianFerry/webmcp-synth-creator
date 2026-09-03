import { describe, expect, it } from 'vitest'

import type { LfoState } from '../../src/patch/types'
import { evaluateOscillatorVisualModulation } from '../../src/ui/oscillators/visualLfoModulation'

const lfo = (overrides: Partial<LfoState> = {}): LfoState => ({
  enabled: true,
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  rate: { mode: 'sync', division: '1/2' },
  phase: 0,
  smooth: false,
  smoothing: 0,
  target: 'position',
  scope: 'all',
  depth: 0.5,
  ...overrides,
})

describe('oscillator visualization LFO feedback', () => {
  it('matches Vital bipolar position math around the serialized base position', () => {
    const positionLfo = lfo({ depth: 1 })

    expect(evaluateOscillatorVisualModulation([positionLfo], 1, 0, 0.5).position).toBe(0)
    expect(evaluateOscillatorVisualModulation([positionLfo], 1, 0.75, 0.5).position).toBeCloseTo(0.75)
    expect(evaluateOscillatorVisualModulation([positionLfo], 1, 0.75, 1).position).toBe(1)
  })

  it('combines both position slots and respects scope', () => {
    const lfos = [lfo({ depth: 0.5 }), lfo({ depth: 0.25, scope: 2 })]
    expect(evaluateOscillatorVisualModulation(lfos, 2, 0.75, 0.5).position).toBeCloseTo(0.6875)
    expect(evaluateOscillatorVisualModulation(lfos, 1, 0.75, 0.5).position).toBeCloseTo(0.625)
  })

  it('applies all-scope position feedback to oscillator cards 1, 2, and 3', () => {
    const positionLfo = lfo({ scope: 'all' })
    for (const oscillatorNumber of [1, 2, 3] as const) {
      expect(evaluateOscillatorVisualModulation([positionLfo], oscillatorNumber, 0.75, 0.5).position).toBeCloseTo(0.625)
    }
  })

  it('uses LFO 2 alone and combines both slots in stable slot order', () => {
    const first = lfo({ depth: 0.2, phase: 0.1 })
    const second = lfo({ depth: 0.4, phase: 0.2 })
    const secondOnly = evaluateOscillatorVisualModulation([lfo({ enabled: false }), second], 3, 0.3, 0.5)
    const combined = evaluateOscillatorVisualModulation([first, second], 3, 0.3, 0.5)
    expect(secondOnly.position).toBeCloseTo(0.5)
    expect(combined.position).toBeCloseTo(0.48)
    expect(evaluateOscillatorVisualModulation([first, second], 3, 0.3, 0.5)).toEqual(combined)
  })

  it('ignores level modulation and unrelated targets', () => {
    const result = evaluateOscillatorVisualModulation([
      lfo({ target: 'level', depth: 0.4 }),
      lfo({ target: 'level', depth: 0.5, phase: 0.25 }),
      lfo({ enabled: false, target: 'level', depth: 1 }),
      lfo({ target: 'pitch', depth: 1 }),
    ], 1, 0.5, 0.42)
    expect(result.position).toBe(0.42)
  })

  it('ignores a disabled position LFO', () => {
    expect(evaluateOscillatorVisualModulation([
      lfo({ enabled: false, depth: 1 }),
    ], 1, 0.75, 0.42).position).toBe(0.42)
  })

  it('falls back to the base position at zero depth', () => {
    expect(evaluateOscillatorVisualModulation([
      lfo({ depth: 0 }),
    ], 1, 0.75, 0.73).position).toBe(0.73)
  })
})
