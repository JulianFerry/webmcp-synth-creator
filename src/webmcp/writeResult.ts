import type { CommandResult } from '../commands/CommandService'

export function writeToolResult(result: CommandResult) {
  return {
    changed: result.changed,
    current: result.current,
    undo_step: result.undoStep,
    canUndo: result.canUndo,
    canRedo: result.canRedo,
    session: result.session,
    correlationId: result.correlationId,
  }
}
