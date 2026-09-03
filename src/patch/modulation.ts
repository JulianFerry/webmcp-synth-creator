import type {
  ModulationDestination,
  ModulationRoute,
  ModulationSource,
  LfoState,
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

const DESTINATION_FIELD = {
  level: 'level',
  position: 'wavetablePosition',
  pitch: 'pitch',
} as const

export function routesFor(lfo: LfoState, source: 'lfo1' | 'lfo2'): ModulationRoute[] {
  if (lfo.target === 'cutoff') {
    return [{
      id: `workbench-${source}-filter-cutoff`,
      source,
      destination: 'filter.cutoff',
      amount: lfo.depth,
      bipolar: true,
    }]
  }
  const target = lfo.target
  const oscillators = lfo.scope === 'all' ? [1, 2, 3] : [lfo.scope]
  return oscillators.map((oscillator) => ({
    id: source === 'lfo1' && target === 'level'
      ? `workbench-lfo-oscillator-${oscillator}-level`
      : `workbench-${source}-oscillator-${oscillator}-${target}`,
    source,
    destination: `oscillator${oscillator}.${DESTINATION_FIELD[target]}` as ModulationDestination,
    amount: target === 'level' ? -lfo.depth : lfo.depth,
    bipolar: target !== 'level',
  }))
}

export const MODULATION_SOURCES = ['lfo1', 'lfo2', 'modEnvelope', 'velocity'] as const

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
  lfo2: [
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

export const MODULATION_DESTINATIONS = [...new Set(
  Object.values(MODULATION_DESTINATIONS_BY_SOURCE).flat(),
)] as ModulationDestination[]

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
    modulations: [
      ...routesFor(patch.lfo1, 'lfo1'),
      ...routesFor(patch.lfo2, 'lfo2'),
      ...(patch.filter.velocityToCutoff > 0 ? [{
        id: 'workbench-velocity-filter-cutoff',
        source: 'velocity' as const,
        destination: 'filter.cutoff' as const,
        amount: patch.filter.velocityToCutoff,
        bipolar: false,
      }] : []),
    ],
  }
}
