import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { routesFor } from '../../src/patch/modulation'

describe('declared Workbench LFO routing', () => {
  it.each([
    ['level', 'all', ['oscillator1.level', 'oscillator2.level', 'oscillator3.level'], -0.4, false],
    ['position', 2, ['oscillator2.wavetablePosition'], 0.4, true],
    ['pitch', 3, ['oscillator3.pitch'], 0.4, true],
    ['cutoff', 'all', ['filter.cutoff'], 0.4, true],
  ] as const)('derives %s / %s routing', (target, scope, destinations, amount, bipolar) => {
    const patch = createDefaultPatch()
    const routes = routesFor({ ...patch.lfo1, target, scope, depth: 0.4 }, 'lfo1')
    expect(routes.map((route) => route.destination)).toEqual(destinations)
    expect(routes.every((route) => route.amount === amount && route.bipolar === bipolar)).toBe(true)
  })
})
