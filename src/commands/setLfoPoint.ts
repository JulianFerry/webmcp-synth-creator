import { moveLfoPoint, setLfoCurvePower } from '../patch/lfoPoints'
import { parseSetLfoPointCommand } from '../patch/schemas'
import type { ApplyPatchCommand, PatchState, SetLfoPointCommand } from '../patch/types'

export function createSetLfoPointTransaction(
  commandInput: SetLfoPointCommand,
  currentPatch: PatchState,
): ApplyPatchCommand {
  const command = parseSetLfoPointCommand(commandInput)
  const lfoKey = `lfo${command.lfo ?? 1}` as const
  const currentPoints = currentPatch[lfoKey].points
  const current = currentPoints[command.index]
  if (!current) throw new RangeError(`LFO point index ${command.index} does not exist`)
  if (command.power !== undefined && command.index === currentPoints.length - 1) {
    throw new RangeError('Curve power cannot be set on the final LFO point')
  }

  let points = structuredClone(currentPoints)
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
    changes: [{ path: `${lfoKey}.points`, value: points }],
  }
}
