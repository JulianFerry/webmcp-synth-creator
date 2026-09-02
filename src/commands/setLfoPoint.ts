import { moveLfoPoint, setLfoCurvePower } from '../patch/lfoPoints'
import { parseSetLfoPointCommand } from '../patch/schemas'
import type { ApplyPatchCommand, PatchState, SetLfoPointCommand } from '../patch/types'

export function createSetLfoPointTransaction(
  commandInput: SetLfoPointCommand,
  currentPatch: PatchState,
): ApplyPatchCommand {
  const command = parseSetLfoPointCommand(commandInput)
  const current = currentPatch.lfo1.points[command.index]
  if (!current) throw new RangeError(`LFO point index ${command.index} does not exist`)
  if (command.power !== undefined && command.index === currentPatch.lfo1.points.length - 1) {
    throw new RangeError('Curve power cannot be set on the final LFO point')
  }

  let points = structuredClone(currentPatch.lfo1.points)
  if (command.x !== undefined || command.y !== undefined) {
    points = moveLfoPoint(points, command.index, {
      ...current,
      x: command.x ?? current.x,
      y: command.y ?? current.y,
    })
  }
  if (command.power !== undefined) {
    points = setLfoCurvePower(points, command.index, command.power)
  }

  return {
    type: 'apply_patch',
    reason: command.reason,
    changes: [{ path: 'lfo1.points', value: points }],
  }
}
