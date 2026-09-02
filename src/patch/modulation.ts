import type {
  ModulationDestination,
  ModulationRoute,
  ModulationSource,
  PatchState,
} from './types'

export const WORKBENCH_LFO_AMOUNT = -0.68

export const WORKBENCH_LFO_ROUTES: readonly ModulationRoute[] = [1, 2, 3].map(
  (oscillator) => ({
    id: `workbench-lfo-oscillator-${oscillator}-level`,
    source: 'lfo1' as const,
    destination: `oscillator${oscillator}.level` as ModulationDestination,
    amount: WORKBENCH_LFO_AMOUNT,
    bipolar: false,
  }),
)

export const MODULATION_DESTINATIONS_BY_SOURCE = {
  lfo1: [
    'oscillator1.level',
    'oscillator1.wavetablePosition',
    'oscillator1.pitch',
    'oscillator2.level',
    'oscillator2.wavetablePosition',
    'oscillator2.pitch',
    'oscillator3.level',
    'oscillator3.wavetablePosition',
    'oscillator3.pitch',
    'filter.cutoff',
  ],
  modEnvelope: [
    'oscillator1.level',
    'oscillator1.wavetablePosition',
    'oscillator1.pitch',
    'oscillator2.level',
    'oscillator2.wavetablePosition',
    'oscillator2.pitch',
    'oscillator3.level',
    'oscillator3.wavetablePosition',
    'oscillator3.pitch',
    'filter.cutoff',
  ],
} as const satisfies Record<ModulationSource, readonly ModulationDestination[]>

export function isAllowedModulationRoute(
  source: ModulationSource,
  destination: ModulationDestination,
): boolean {
  return (MODULATION_DESTINATIONS_BY_SOURCE[source] as readonly ModulationDestination[]).includes(
    destination,
  )
}

export function withWorkbenchLfoRouting(patch: PatchState): PatchState {
  return {
    ...patch,
    modulations: WORKBENCH_LFO_ROUTES.map((route) => ({ ...route })),
  }
}
