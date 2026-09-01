import { EFFECT_IDS, type EffectId } from '../patch/effects'

export const VITAL_EFFECT_INDEX = {
  chorus: 0,
  compressor: 1,
  delay: 2,
  distortion: 3,
  filter: 5,
  reverb: 8,
} as const satisfies Record<EffectId, number>

export const VITAL_UNMODELED_EFFECT_ORDER = [4, 6, 7] as const
export const VITAL_EFFECT_COUNT = 9
export const VITAL_EFFECT_ORDER_MAX = factorial(VITAL_EFFECT_COUNT) - 1

const EFFECT_ID_BY_VITAL_INDEX = new Map<number, EffectId>(
  Object.entries(VITAL_EFFECT_INDEX).map(([id, index]) => [index, id as EffectId]),
)

export function toVitalEffectIndexes(order: readonly EffectId[]): number[] {
  assertLogicalEffectOrder(order)
  return [...order.map((id) => VITAL_EFFECT_INDEX[id]), ...VITAL_UNMODELED_EFFECT_ORDER]
}

export function encodeVitalEffectOrder(order: readonly EffectId[]): number {
  return encodeOrderToFloat(toVitalEffectIndexes(order))
}

export function decodeVitalEffectOrder(value: number): EffectId[] {
  return decodeFloatToOrder(value, VITAL_EFFECT_COUNT).flatMap((index) => {
    const effect = EFFECT_ID_BY_VITAL_INDEX.get(index)
    return effect === undefined ? [] : [effect]
  })
}

export function encodeOrderToFloat(order: readonly number[]): number {
  assertIndexPermutation(order)
  // Mirrors vital::utils::encodeOrderToFloat at mtytel/vital@636ca0e.
  let code = 0
  for (let index = 1; index < order.length; index += 1) {
    let inversions = 0
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (order[index] < order[earlier]) inversions += 1
    }
    code = code * (index + 1) + inversions
  }
  return code
}

export function decodeFloatToOrder(value: number, size: number): number[] {
  if (!Number.isInteger(size) || size < 1 || size > 12) {
    throw new RangeError('Vital effect order size must be an integer between 1 and 12')
  }
  const maximum = factorial(size) - 1
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`Vital effect order must be an integer between 0 and ${maximum}`)
  }

  let code = value
  const order = Array.from({ length: size }, (_, index) => index)
  // Mirrors vital::utils::decodeFloatToOrder at the same pinned source revision.
  for (let index = 0; index < size; index += 1) {
    const remaining = size - index
    const destination = remaining - 1
    const inversions = code % remaining
    code = Math.floor(code / remaining)
    const source = destination - inversions
    const placement = order[source]
    for (let shift = source; shift < destination; shift += 1) order[shift] = order[shift + 1]
    order[destination] = placement
  }
  return order
}

function assertLogicalEffectOrder(order: readonly EffectId[]): void {
  if (
    order.length !== EFFECT_IDS.length ||
    new Set(order).size !== EFFECT_IDS.length ||
    order.some((id) => !EFFECT_IDS.includes(id))
  ) {
    throw new RangeError('Effect order must contain each modeled effect exactly once')
  }
}

function assertIndexPermutation(order: readonly number[]): void {
  if (
    order.length < 1 ||
    order.some((value) => !Number.isInteger(value) || value < 0 || value >= order.length) ||
    new Set(order).size !== order.length
  ) {
    throw new RangeError('Vital effect indexes must be a complete zero-based permutation')
  }
}

function factorial(value: number): number {
  let result = 1
  for (let factor = 2; factor <= value; factor += 1) result *= factor
  return result
}
