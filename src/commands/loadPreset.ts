import { z } from 'zod'

import type { PatchState } from '../patch/types'
import { getPresetPatch } from '../presets/registry'
import { createPatchTransaction, type PatchReplacementTransaction } from './createPatch'

export interface LoadPresetCommand {
  type: 'load_preset'
  presetId: string
}

const loadPresetCommandSchema = z
  .object({
    type: z.literal('load_preset'),
    presetId: z.string().trim().min(1).max(64),
  })
  .strict()

export function createLoadPresetTransaction(
  currentPatch: PatchState,
  commandInput: LoadPresetCommand,
): PatchReplacementTransaction {
  const command = loadPresetCommandSchema.parse(commandInput)
  const patch = getPresetPatch(command.presetId)
  return createPatchTransaction(currentPatch, {
    type: 'create_patch',
    reason: `Load curated preset: ${patch.metadata.name}`,
    patch,
  })
}
