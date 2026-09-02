import type { FilterType } from '../patch/types'

export interface VitalFxFilterType {
  model: number
  style: number
  blend: number
}

// Pinned mtytel/vital@636ca0e values: Analog model 0, SynthFilter 12dB style 0,
// Notch Blend style 2, and the filter pass-blend endpoints 0 (low), 1 (band), 2 (high).
export const VITAL_FX_FILTER_TYPES = {
  lowpass: { model: 0, style: 0, blend: 0 },
  highpass: { model: 0, style: 0, blend: 2 },
  bandpass: { model: 0, style: 0, blend: 1 },
  notch: { model: 0, style: 2, blend: 1 },
} as const satisfies Record<FilterType, VitalFxFilterType>

export function mapVitalFxFilterType(type: FilterType): VitalFxFilterType {
  return VITAL_FX_FILTER_TYPES[type]
}

export function decodeVitalFxFilterType(values: VitalFxFilterType): FilterType {
  const match = (Object.entries(VITAL_FX_FILTER_TYPES) as Array<[
    FilterType,
    VitalFxFilterType,
  ]>).find(
    ([, candidate]) =>
      candidate.model === values.model &&
      candidate.style === values.style &&
      candidate.blend === values.blend,
  )
  if (match === undefined) {
    throw new RangeError(
      `Unsupported Vital FX filter model/style/blend: ${values.model}/${values.style}/${values.blend}`,
    )
  }
  return match[0]
}
