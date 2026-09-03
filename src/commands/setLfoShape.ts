import { parseSetLfoShapeCommand } from '../patch/schemas'
import type { ApplyPatchCommand, PatchState, SetLfoShapeCommand } from '../patch/types'

export function createSetLfoShapeTransaction(
  commandInput: SetLfoShapeCommand,
  currentPatch: PatchState,
): ApplyPatchCommand {
  const command = parseSetLfoShapeCommand(commandInput)
  const lfoKey = `lfo${command.lfo ?? 1}` as const
  const currentLfo = currentPatch[lfoKey]
  const changes: ApplyPatchCommand['changes'] = [
    { path: `${lfoKey}.points`, value: structuredClone(command.points) },
  ]

  if (command.smooth !== undefined && command.smooth !== currentLfo.smooth) {
    changes.push({ path: `${lfoKey}.smooth`, value: command.smooth })
  }

  return {
    type: 'apply_patch',
    reason: command.reason,
    changes,
  }
}
