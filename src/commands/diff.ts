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

function wavetableDataSummary(patch: PatchState) {
  const serialized = JSON.stringify(patch.wavetableData)
  let signature = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    signature ^= serialized.charCodeAt(index)
    signature = Math.imul(signature, 16777619)
  }

  return {
    ids: Object.keys(patch.wavetableData).sort(),
    frames: Object.values(patch.wavetableData).reduce(
      (total, wavetable) => total + wavetable.frames.length,
      0,
    ),
    signature: (signature >>> 0).toString(16).padStart(8, '0'),
  }
}

export function diffCompletePatch(before: PatchState, after: PatchState): PatchDiff {
  const changed = diffSupportedPaths(before, after)
  if (!valuesEqual(before.wavetableData, after.wavetableData)) {
    changed.wavetableData = {
      before: wavetableDataSummary(before),
      after: wavetableDataSummary(after),
    }
  }
  return changed
}
