import type { PatchState } from '../../patch/types'
import type {
  ImportedVitalBacking,
  VitalPresetAdapter,
} from '../../vital/VitalPresetAdapter'

export function vitalEnginePayload(
  adapter: VitalPresetAdapter,
  patch: PatchState,
  backing: ImportedVitalBacking | null = null,
): string {
  return adapter.exportPatch(patch, backing).json
}
