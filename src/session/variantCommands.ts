import { z } from 'zod'

import { applyPatchChanges } from '../commands/applyPatch'
import { diffSupportedPaths, type PatchDiff } from '../commands/diff'
import type { HistoryEntry } from '../commands/history'
import { parseApplyPatchCommand } from '../patch/schemas'
import type { PatchState } from '../patch/types'
import type { Change } from '../ops/types'
import type { VariantId } from './SessionService'

export interface CreateVariantCommand {
  type: 'create_variant'
  reason: string
  changes: Change[]
  replaceExisting?: boolean
}

export interface SelectVariantCommand {
  type: 'select_variant'
  variant: VariantId
}

export interface VariantCreationTransaction {
  patch: PatchState
  changed: PatchDiff
  historyEntry: HistoryEntry
  replaceExisting: boolean
}

export function createVariantTransaction(
  currentPatch: PatchState,
  commandInput: CreateVariantCommand,
): VariantCreationTransaction {
  const replaceExisting = z.boolean().optional().parse(commandInput.replaceExisting) ?? false
  const command = parseApplyPatchCommand({
    type: 'apply_patch',
    reason: commandInput.reason,
    changes: commandInput.changes,
  }, currentPatch)
  const patch = applyPatchChanges(currentPatch, command)
  const changed = diffSupportedPaths(
    currentPatch,
    patch,
    command.changes.map((change) => change.path),
  )

  return {
    patch,
    changed,
    historyEntry: {
      before: currentPatch,
      after: patch,
      changed,
      reason: command.reason,
    },
    replaceExisting,
  }
}

export function parseSelectVariantCommand(command: SelectVariantCommand): SelectVariantCommand {
  if (command.type !== 'select_variant' || (command.variant !== 'A' && command.variant !== 'B')) {
    throw new TypeError('variant must be A or B')
  }
  return command
}
