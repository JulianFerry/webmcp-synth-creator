import { describe, expect, it } from 'vitest'

import type { LfoState } from '../../src/patch/types'
import { lfoHasEnabledTarget } from '../../src/ui/lfoVisualization'

const route = (scope: LfoState['scope'], target: LfoState['target'] = 'position') => ({ scope, target })
const oscillators = (...enabled: boolean[]) => enabled.map((value) => ({ enabled: value }))

describe('LFO playhead visualization gating', () => {
  it('requires the scoped oscillator to be enabled', () => {
    expect(lfoHasEnabledTarget(route(1), oscillators(true, false, false))).toBe(true)
    expect(lfoHasEnabledTarget(route(2), oscillators(true, false, true))).toBe(false)
    expect(lfoHasEnabledTarget(route(3), oscillators(false, false, true))).toBe(true)
  })

  it('sweeps all-scope routes when any affected oscillator is enabled', () => {
    expect(lfoHasEnabledTarget(route('all'), oscillators(false, true, false))).toBe(true)
    expect(lfoHasEnabledTarget(route('all'), oscillators(false, false, false))).toBe(false)
  })

  it('treats cutoff as global while still requiring an enabled oscillator', () => {
    expect(lfoHasEnabledTarget(route(2, 'cutoff'), oscillators(true, false, false))).toBe(true)
    expect(lfoHasEnabledTarget(route('all', 'cutoff'), oscillators(false, false, false))).toBe(false)
  })
})
