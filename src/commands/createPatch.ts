import { z } from 'zod'

import { patchStateSchema, parsePatchState } from '../patch/schemas'
import type { PatchState } from '../patch/types'
import type { HistoryEntry } from './history'
import { diffCompletePatch, type PatchDiff } from './diff'

export interface CreatePatchCommand {
  type: 'create_patch'
  reason: string
  patch: PatchState
}

export interface PatchReplacementTransaction {
  patch: PatchState
  changed: PatchDiff
  historyEntry: HistoryEntry
  reason: string
}

const createPatchCommandSchema = z
  .object({
    type: z.literal('create_patch'),
    reason: z.string().trim().min(1).max(500),
    patch: patchStateSchema,
  })
  .strict()

export function createPatchTransaction(
  currentPatch: PatchState,
  commandInput: CreatePatchCommand,
): PatchReplacementTransaction {
  const command = createPatchCommandSchema.parse(commandInput)
  const patch = parsePatchState(structuredClone(command.patch))
  const changed = diffCompletePatch(currentPatch, patch)
  return {
    patch,
    changed,
    reason: command.reason,
    historyEntry: {
      before: currentPatch,
      after: patch,
      changed,
      reason: command.reason,
    },
  }
}
