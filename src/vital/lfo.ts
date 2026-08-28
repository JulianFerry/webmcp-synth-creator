import type { LfoRate, LfoState } from '../patch/types'
import type { TempoSyncDivision } from '../patch/limits'
import { DEFAULT_TEMPO_BPM, lfoRateHz } from '../audio/lfo'

const VITAL_TEMPO_INDEX = {
  '1/1': 6,
  '1/2': 7,
  '1/4': 8,
  '1/8': 9,
  '1/8T': 9,
  '1/16': 10,
  '1/16T': 10,
  '1/32': 11,
  '1/64': 12,
} as const satisfies Record<TempoSyncDivision, number>

export interface VitalLfoRateValues {
  sync: 0 | 1 | 3
  tempo: number
  frequency: number
}

export function mapVitalLfoRate(rate: LfoRate): VitalLfoRateValues {
  if (rate.mode === 'free') {
    return {
      sync: 0,
      tempo: VITAL_TEMPO_INDEX['1/4'],
      frequency: Math.log2(rate.hz),
    }
  }
  return {
    sync: rate.division.endsWith('T') ? 3 : 1,
    tempo: VITAL_TEMPO_INDEX[rate.division],
    frequency: Math.log2(lfoRateHz(rate, DEFAULT_TEMPO_BPM)),
  }
}

export interface VitalLfo {
  name: string
  num_points: number
  points: number[]
  powers: number[]
  smooth: boolean
}

export function encodeVitalLfoPointValue(value: number): number {
  return 1 - value
}

export function decodeVitalLfoPointValue(value: number): number {
  return 1 - value
}

export function buildVitalLfo(lfo: LfoState, name = 'Wavetable Workbench LFO 1'): VitalLfo {
  return {
    name,
    num_points: lfo.points.length,
    points: lfo.points.flatMap((point) => [point.x, encodeVitalLfoPointValue(point.y)]),
    powers: lfo.points.map((point) => point.power ?? 0),
    smooth: lfo.smooth,
  }
}
