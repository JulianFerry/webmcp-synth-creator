import type { ModulationDestination, ModulationSource } from './types'

export const MODULATION_DESTINATIONS_BY_SOURCE = {
  lfo1: [
    'oscillator1.level',
    'oscillator1.wavetablePosition',
    'oscillator1.pitch',
    'oscillator1.pan',
    'oscillator2.level',
    'oscillator2.wavetablePosition',
    'oscillator2.pitch',
    'oscillator2.pan',
    'oscillator3.level',
    'oscillator3.wavetablePosition',
    'oscillator3.pitch',
    'oscillator3.pan',
    'filter.cutoff',
    'volume',
  ],
  modEnvelope: [
    'oscillator1.level',
    'oscillator1.wavetablePosition',
    'oscillator1.pitch',
    'oscillator1.pan',
    'oscillator2.level',
    'oscillator2.wavetablePosition',
    'oscillator2.pitch',
    'oscillator2.pan',
    'oscillator3.level',
    'oscillator3.wavetablePosition',
    'oscillator3.pitch',
    'oscillator3.pan',
    'filter.cutoff',
    'volume',
  ],
  velocity: ['filter.cutoff', 'volume'],
} as const satisfies Record<ModulationSource, readonly ModulationDestination[]>

export function isAllowedModulationRoute(
  source: ModulationSource,
  destination: ModulationDestination,
): boolean {
  return (MODULATION_DESTINATIONS_BY_SOURCE[source] as readonly ModulationDestination[]).includes(
    destination,
  )
}
