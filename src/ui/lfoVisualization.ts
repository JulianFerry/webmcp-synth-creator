import type { LfoState, OscillatorState } from '../patch/types'

export function lfoHasEnabledTarget(
  lfo: Pick<LfoState, 'scope' | 'target'>,
  oscillators: readonly Pick<OscillatorState, 'enabled'>[],
): boolean {
  if (lfo.target === 'cutoff' || lfo.scope === 'all') {
    return oscillators.some(({ enabled }) => enabled)
  }
  return oscillators[lfo.scope - 1]?.enabled === true
}
