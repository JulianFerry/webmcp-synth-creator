import { ETHEREAL_GATE_PATCH } from '../presets/patches/ethereal-gate'
import type { PatchState } from './types'

export function createDefaultPatch(): PatchState {
  return structuredClone(ETHEREAL_GATE_PATCH)
}

export const DEFAULT_PATCH = createDefaultPatch()
