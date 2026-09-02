import type { FilterState, FilterType } from '../patch/types'

export interface VitalFxFilterType {
  model: number
  style: number
  blend: number
}

// Pinned mtytel/vital@636ca0e values: Analog model 0, SynthFilter 12dB style 0,
// Notch Blend style 2, and the filter pass-blend endpoints 0 (low), 1 (band), 2 (high).
export const VITAL_FX_FILTER_TYPES = {
  'lowpass:12': { model: 0, style: 0, blend: 0 },
  'lowpass:24': { model: 0, style: 1, blend: 0 },
  'highpass:12': { model: 0, style: 0, blend: 2 },
  'highpass:24': { model: 0, style: 1, blend: 2 },
  'bandpass:12': { model: 0, style: 0, blend: 1 },
  'bandpass:24': { model: 0, style: 1, blend: 1 },
  'notch:12': { model: 0, style: 2, blend: 1 },
  'notch:24': { model: 0, style: 2, blend: 1 },
} as const satisfies Record<`${FilterType}:${FilterState['slope']}`, VitalFxFilterType>

export function mapVitalFxFilterType(type: FilterType, slope: FilterState['slope'] = 12): VitalFxFilterType {
  return VITAL_FX_FILTER_TYPES[`${type}:${slope}`]
}

export function decodeVitalFxFilterType(values: VitalFxFilterType): Pick<FilterState, 'type' | 'slope'> {
  const match = (Object.entries(VITAL_FX_FILTER_TYPES) as Array<[
    `${FilterType}:${FilterState['slope']}`,
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
  const [type, slope] = match[0].split(':') as [FilterType, `${FilterState['slope']}`]
  return { type, slope: Number(slope) as FilterState['slope'] }
}
