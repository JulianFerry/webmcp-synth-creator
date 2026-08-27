import {
  getPatchPathValue,
  SUPPORTED_PATCH_PATHS,
  type SupportedPatchPath,
} from '../patch/paths'
import type { PatchState } from '../patch/types'

export type PatchDiff = Record<string, { before: unknown; after: unknown }>

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function diffSupportedPaths(
  before: PatchState,
  after: PatchState,
  paths: readonly SupportedPatchPath[] = SUPPORTED_PATCH_PATHS,
): PatchDiff {
  const changed: PatchDiff = {}
  for (const path of paths) {
    const beforeValue = getPatchPathValue(before, path)
    const afterValue = getPatchPathValue(after, path)
    if (!valuesEqual(beforeValue, afterValue)) {
      changed[path] = {
        before: structuredClone(beforeValue),
        after: structuredClone(afterValue),
      }
    }
  }
  return changed
}
