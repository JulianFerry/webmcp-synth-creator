import { evaluateLfo } from '../../audio/lfo'
import type { LfoState } from '../../patch/types'

export interface OscillatorVisualModulation {
  position: number
}

export function evaluateOscillatorVisualModulation(
  lfos: readonly LfoState[],
  oscillatorNumber: 1 | 2 | 3,
  elapsedSeconds: number,
  basePosition: number,
): OscillatorVisualModulation {
  let position = basePosition

  for (const lfo of lfos) {
    if (!lfo.enabled || (lfo.scope !== 'all' && lfo.scope !== oscillatorNumber)) continue
    if (lfo.target === 'position') {
      const value = evaluateLfo(lfo, elapsedSeconds)
      position += (value - 0.5) * lfo.depth
    }
  }

  return {
    position: Math.max(0, Math.min(1, position)),
  }
}
