import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { routesFor } from '../../src/patch/modulation'

describe('declared Workbench LFO routing', () => {
  it.each([
    ['level', 'all', ['oscillator1.level', 'oscillator2.level', 'oscillator3.level'], -0.4, false],
    ['level', 1, ['oscillator1.level'], -0.4, false],
    ['level', 2, ['oscillator2.level'], -0.4, false],
    ['level', 3, ['oscillator3.level'], -0.4, false],
    ['position', 'all', ['oscillator1.wavetablePosition', 'oscillator2.wavetablePosition', 'oscillator3.wavetablePosition'], 0.4, true],
    ['position', 1, ['oscillator1.wavetablePosition'], 0.4, true],
    ['position', 2, ['oscillator2.wavetablePosition'], 0.4, true],
    ['position', 3, ['oscillator3.wavetablePosition'], 0.4, true],
    ['pitch', 'all', ['oscillator1.pitch', 'oscillator2.pitch', 'oscillator3.pitch'], 0.4, true],
    ['pitch', 1, ['oscillator1.pitch'], 0.4, true],
    ['pitch', 2, ['oscillator2.pitch'], 0.4, true],
    ['pitch', 3, ['oscillator3.pitch'], 0.4, true],
    ['cutoff', 'all', ['filter.cutoff'], 0.4, true],
  ] as const)('derives %s / %s routing', (target, scope, destinations, amount, bipolar) => {
    const patch = createDefaultPatch()
    for (const source of ['lfo1', 'lfo2'] as const) {
      const routes = routesFor({ ...patch[source], target, scope, depth: 0.4 }, source)
      expect(routes.map((route) => route.destination)).toEqual(destinations)
      expect(routes.every((route) =>
        route.source === source && route.amount === amount && route.bipolar === bipolar,
      )).toBe(true)
    }
  })
})
