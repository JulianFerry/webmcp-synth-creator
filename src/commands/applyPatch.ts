import { setPatchPathValue } from '../patch/paths'
import { parsePatchState } from '../patch/schemas'
import type { ApplyPatchCommand, PatchState } from '../patch/types'
import { includeGeneratedWavetables } from '../wavetables/registry'

export function applyPatchChanges(patch: PatchState, command: ApplyPatchCommand): PatchState {
  const nextPatch = structuredClone(patch)
  for (const change of command.changes) {
    setPatchPathValue(nextPatch, change.path, structuredClone(change.value))
  }
  nextPatch.wavetableData = includeGeneratedWavetables(
    nextPatch.wavetableData,
    nextPatch.oscillators.map(({ wavetableId }) => wavetableId),
  )
  return parsePatchState(nextPatch)
}
