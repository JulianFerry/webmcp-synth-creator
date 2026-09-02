import { describe, expect, it } from 'vitest'

import { DEFAULT_EFFECT_ORDER, type EffectId } from '../../src/patch/effects'
import {
  decodeFloatToOrder,
  decodeVitalEffectOrder,
  encodeOrderToFloat,
  encodeVitalEffectOrder,
  toVitalEffectIndexes,
  VITAL_EFFECT_ORDER_MAX,
} from '../../src/vital/effectOrder'

describe('Vital effect-order codec', () => {
  it('encodes the default UI order with disabled unmodeled effects appended stably', () => {
    expect(toVitalEffectIndexes(DEFAULT_EFFECT_ORDER)).toEqual([3, 5, 1, 0, 2, 8, 4, 6, 7])
    expect(encodeVitalEffectOrder(DEFAULT_EFFECT_ORDER)).toBe(172_522)
    expect(decodeVitalEffectOrder(172_522)).toEqual(DEFAULT_EFFECT_ORDER)
  })

  it.each<{ order: EffectId[] }>([
    { order: ['reverb', 'distortion', 'filter', 'compressor', 'chorus', 'delay'] },
    { order: ['filter', 'compressor', 'chorus', 'delay', 'reverb', 'distortion'] },
  ])('round-trips first and last drag endpoint $order', ({ order }) => {
    const indexes = toVitalEffectIndexes(order)
    expect(indexes.slice(-3)).toEqual([4, 6, 7])
    expect(new Set(indexes).size).toBe(9)
    expect(decodeVitalEffectOrder(encodeVitalEffectOrder(order))).toEqual(order)
  })

  it('matches Vital encodeOrderToFloat and decodeFloatToOrder for complete permutations', () => {
    const permutations = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
      [3, 5, 1, 0, 2, 8, 4, 6, 7],
      [5, 2, 8, 0, 7, 1, 6, 4, 3],
    ]
    for (const order of permutations) {
      const encoded = encodeOrderToFloat(order)
      expect(encoded).toBe(encodeOrderToFloat(order))
      expect(decodeFloatToOrder(encoded, 9)).toEqual(order)
    }
    expect(encodeOrderToFloat(permutations[0])).toBe(0)
    expect(encodeOrderToFloat(permutations[1])).toBe(VITAL_EFFECT_ORDER_MAX)
  })

  it('rejects duplicate logical effects and invalid encoded values', () => {
    expect(() =>
      encodeVitalEffectOrder([
        'filter',
        'filter',
        'compressor',
        'chorus',
        'delay',
        'reverb',
      ]),
    ).toThrow(/each modeled effect exactly once/)
    expect(() => decodeVitalEffectOrder(-1)).toThrow(/between 0/)
    expect(() => decodeVitalEffectOrder(VITAL_EFFECT_ORDER_MAX + 1)).toThrow(/between 0/)
  })
})
