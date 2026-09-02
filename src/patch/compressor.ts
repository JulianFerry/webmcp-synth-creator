import type { CompressorState } from './types'

export const COMPRESSOR_THRESHOLD_OFFSET_DB = 20

export const COMPRESSOR_THRESHOLD_DEFAULTS_DB = {
  compressor_low_upper_threshold: -28,
  compressor_band_upper_threshold: -25,
  compressor_high_upper_threshold: -30,
  compressor_low_lower_threshold: -35,
  compressor_band_lower_threshold: -36,
  compressor_high_lower_threshold: -35,
} as const

export const DEFAULT_COMPRESSOR_STATE = {
  enabled: false,
  bands: 'multiband',
  amount: 0,
  attack: 0.5,
  release: 0.5,
  mix: 1,
} as const satisfies CompressorState
