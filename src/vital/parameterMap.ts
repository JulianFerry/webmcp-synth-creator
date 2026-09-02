import type { TempoSyncDivision } from '../patch/limits'
import type { PatchState } from '../patch/types'
import { FORCED_VITAL_BINDINGS, mapVitalScalarValues } from './bindings'
import { encodeVitalEffectOrder } from './effectOrder'
import { mapVitalFxFilterType } from './filter'
import { mapVitalLfoRate } from './lfo'
import { encodeVitalDelaySeconds } from './units'

export function mapPhaseOneVitalParameters(patch: PatchState): Record<string, number> {
  const filterType = mapVitalFxFilterType(patch.filter.type, patch.filter.slope)

  return {
    ...mapVitalScalarValues(patch),
    ...Object.fromEntries(FORCED_VITAL_BINDINGS.map(({ key, value }) => [key, value])),
    filter_fx_model: filterType.model,
    filter_fx_style: filterType.style,
    filter_fx_blend: filterType.blend,
  }
}

const VITAL_DELAY_TEMPO_INDEX = {
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

export function mapStructuredVitalParameters(patch: PatchState): Record<string, number> {
  const lfoRate = mapVitalLfoRate(patch.lfo1.rate)
  const delay = patch.effects.delay
  const delayDivision = delay.division ?? '1/8'
  const delaySync = delay.mode === 'free' ? 0 : delayDivision.endsWith('T') ? 3 : 1
  const delayFrequency = encodeVitalDelaySeconds(delay.timeSeconds ?? 0.25)

  return {
    effect_chain_order: encodeVitalEffectOrder(patch.effects.order),
    lfo_1_sync: lfoRate.sync,
    lfo_1_tempo: lfoRate.tempo,
    lfo_1_frequency: lfoRate.frequency,
    delay_sync: delaySync,
    delay_aux_sync: delaySync,
    delay_tempo: VITAL_DELAY_TEMPO_INDEX[delayDivision],
    delay_aux_tempo: VITAL_DELAY_TEMPO_INDEX[delayDivision],
    delay_frequency: delayFrequency,
    delay_aux_frequency: delayFrequency,
  }
}

export function setVitalValues(
  settings: Record<string, unknown>,
  values: Record<string, number>,
): void {
  const unknown = Object.keys(values).filter((key) => !(key in settings))
  if (unknown.length > 0) {
    throw new VitalExportError(`Unknown Vital settings: ${unknown.sort().join(', ')}`)
  }
  Object.assign(settings, values)
}

export class VitalExportError extends Error {}
