export const FILTER_CUTOFF_MIN_HZ = 20
export const FILTER_CUTOFF_MAX_HZ = 20_000
export const ENVELOPE_HOLD_MAX_SECONDS = 4
export const ENVELOPE_DELAY_MAX_SECONDS = 4
export const DELAY_TIME_MIN_SECONDS = 1 / 512
export const DELAY_TIME_MAX_SECONDS = 4
export const REVERB_DECAY_MIN_SECONDS = 1 / 64
export const REVERB_DECAY_MAX_SECONDS = 20
export const REVERB_PREDELAY_MAX_SECONDS = 0.3
export const LEGACY_ENVELOPE_ATTACK_CURVE = 0
export const LEGACY_ENVELOPE_DECAY_RELEASE_CURVE = -0.1
export const LEGACY_LFO_SMOOTHING_OFF = 1.5 / 14
export const LEGACY_LFO_SMOOTHING_ON = 5 / 14

export const TEMPO_SYNC_DIVISIONS = [
  '1/1',
  '1/2',
  '1/4',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
  '1/64',
] as const

export const STRAIGHT_LFO_DIVISIONS = [
  '1/1',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
  '1/32',
  '1/64',
] as const

export type TempoSyncDivision = (typeof TEMPO_SYNC_DIVISIONS)[number]
