import { evaluateLfo } from '../../audio/lfo'
import type { LfoState } from '../../patch/types'

export interface OscillatorVisualModulation {
  positionOffset: number
}

export function evaluateOscillatorVisualModulation(
  lfos: readonly LfoState[],
  oscillatorNumber: 1 | 2 | 3,
  elapsedSeconds: number,
): OscillatorVisualModulation {
  let positionOffset = 0

  for (const lfo of lfos) {
    if (!lfo.enabled || (lfo.scope !== 'all' && lfo.scope !== oscillatorNumber)) continue
    if (lfo.target === 'position') {
      const value = evaluateLfo(lfo, elapsedSeconds)
      positionOffset += (value * 2 - 1) * lfo.depth
    }
  }

  return {
    positionOffset,
  }
}
