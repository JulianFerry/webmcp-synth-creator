import type { PatchState } from '../../patch/types'
import type { VitalPresetAdapter } from '../../vital/VitalPresetAdapter'

export function vitalEnginePayload(adapter: VitalPresetAdapter, patch: PatchState): string {
  return adapter.exportPatch(patch).json
}
