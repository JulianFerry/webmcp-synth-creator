import type {
  ModulationDestination,
  ModulationRoute,
  ModulationSource,
} from '../patch/types'
import { VitalExportError } from './parameterMap'

export const VITAL_MODULATION_SOURCES: Record<ModulationSource, string> = {
  lfo1: 'lfo_1',
  modEnvelope: 'env_2',
}

export const VITAL_MODULATION_DESTINATIONS: Record<ModulationDestination, string> = {
  'oscillator1.level': 'osc_1_level',
  'oscillator1.wavetablePosition': 'osc_1_wave_frame',
  'oscillator1.pitch': 'osc_1_tune',
  'oscillator2.level': 'osc_2_level',
  'oscillator2.wavetablePosition': 'osc_2_wave_frame',
  'oscillator2.pitch': 'osc_2_tune',
  'oscillator3.level': 'osc_3_level',
  'oscillator3.wavetablePosition': 'osc_3_wave_frame',
  'oscillator3.pitch': 'osc_3_tune',
  'filter.cutoff': 'filter_1_cutoff',
}

export interface VitalModulationRoute {
  source: string
  destination: string
}

export interface VitalModulationExport {
  routes: VitalModulationRoute[]
  values: Record<string, number>
}

export function buildVitalModulations(
  logicalRoutes: readonly ModulationRoute[],
  slotCount: number,
  sourceEnabled: Partial<Record<ModulationSource, boolean>> = {},
): VitalModulationExport {
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new VitalExportError('Vital fixture has no modulation slots')
  }
  if (logicalRoutes.length > slotCount) {
    throw new VitalExportError(
      `Patch requires ${logicalRoutes.length} modulation slots but fixture has ${slotCount}`,
    )
  }

  const routes = Array.from({ length: slotCount }, () => ({ source: '', destination: '' }))
  const values: Record<string, number> = {}

  for (let index = 0; index < slotCount; index += 1) {
    const slot = index + 1
    values[`modulation_${slot}_amount`] = 0
    values[`modulation_${slot}_bipolar`] = 0
    values[`modulation_${slot}_stereo`] = 0
    values[`modulation_${slot}_power`] = 0
    values[`modulation_${slot}_bypass`] = 0
  }

  logicalRoutes.forEach((route, index) => {
    const slot = index + 1
    routes[index] = {
      source: VITAL_MODULATION_SOURCES[route.source],
      destination: VITAL_MODULATION_DESTINATIONS[route.destination],
    }
    values[`modulation_${slot}_amount`] = route.amount
    values[`modulation_${slot}_bipolar`] = Number(route.bipolar)
    values[`modulation_${slot}_bypass`] = Number(sourceEnabled[route.source] === false)
  })

  return { routes, values }
}
