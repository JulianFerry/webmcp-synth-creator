import { describe, expect, it } from 'vitest'

import { findRoute, removeRoute, upsertRoute } from '../../src/ops/modulationRoutes'
import type { ModulationRoute } from '../../src/patch/types'

describe('operation modulation route helpers', () => {
  const route: ModulationRoute = { id: 'existing', source: 'lfo1', destination: 'filter.cutoff', amount: 0.2, bipolar: false }

  it('finds, updates without duplicating, and removes a source/destination pair', () => {
    expect(findRoute([route], 'lfo1', 'filter.cutoff')).toBe(route)
    expect(upsertRoute([route], { source: 'lfo1', destination: 'filter.cutoff', amount: 0.6, bipolar: true })).toEqual([
      { ...route, amount: 0.6, bipolar: true },
    ])
    expect(removeRoute([route], 'lfo1', 'filter.cutoff')).toEqual([])
  })

  it('generates stable collision-free ids and enforces the 16-route cap', () => {
    expect(upsertRoute([], { source: 'lfo1', destination: 'volume', amount: -0.8, bipolar: false })[0].id).toBe('lfo1-volume')
    expect(upsertRoute([
      { id: 'lfo1-volume', source: 'modEnvelope', destination: 'volume', amount: 0.1, bipolar: false },
    ], { source: 'lfo1', destination: 'volume', amount: -0.8, bipolar: false }).at(-1)?.id).toBe('lfo1-volume-2')
    const full = Array.from({ length: 16 }, (_, index): ModulationRoute => ({
      id: `route-${index}`, source: 'lfo1', destination: 'volume', amount: 0.1, bipolar: false,
    }))
    expect(() => upsertRoute(full, { source: 'velocity', destination: 'filter.cutoff', amount: 0.5, bipolar: false })).toThrow(RangeError)
    expect(upsertRoute(full, { source: 'lfo1', destination: 'volume', amount: 0.9, bipolar: true })).toHaveLength(16)
  })

  it('removes only the requested pair and preserves stable order and ids', () => {
    const routes: ModulationRoute[] = [
      route,
      { id: 'keep-1', source: 'lfo1', destination: 'volume', amount: -0.8, bipolar: false },
      { id: 'keep-2', source: 'velocity', destination: 'filter.cutoff', amount: 0.5, bipolar: false },
    ]
    expect(removeRoute(routes, 'lfo1', 'filter.cutoff')).toEqual([routes[1], routes[2]])
    expect(upsertRoute(routes, { source: 'lfo1', destination: 'filter.cutoff', amount: 0.7, bipolar: true })).toEqual([
      { ...route, amount: 0.7, bipolar: true }, routes[1], routes[2],
    ])
  })
})
