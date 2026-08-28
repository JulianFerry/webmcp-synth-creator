import { parseSetLfoShapeCommand } from '../patch/schemas'
import type { ApplyPatchCommand, PatchState, SetLfoShapeCommand } from '../patch/types'

export function createSetLfoShapeTransaction(
  commandInput: SetLfoShapeCommand,
  currentPatch: PatchState,
): ApplyPatchCommand {
  const command = parseSetLfoShapeCommand(commandInput)
  const changes: ApplyPatchCommand['changes'] = [
    { path: 'lfo1.points', value: structuredClone(command.points) },
  ]

  if (command.smooth !== undefined && command.smooth !== currentPatch.lfo1.smooth) {
    changes.push({ path: 'lfo1.smooth', value: command.smooth })
  }

  return {
    type: 'apply_patch',
    reason: command.reason,
    changes,
  }
}
