import { LatencyTrace, type RequestSource } from '../dev/latencyTrace'
import { SUPPORTED_PATCH_PATHS } from '../patch/paths'
import { parseApplyPatchCommand } from '../patch/schemas'
import { summarizePatch } from '../patch/summary'
import type { ApplyPatchCommand, CommandResult, SetLfoShapeCommand } from '../patch/types'
import { SessionService } from '../session/SessionService'
import { applyPatchChanges } from './applyPatch'
import { diffSupportedPaths } from './diff'
import { PatchHistory } from './history'
import { createSetLfoShapeTransaction } from './setLfoShape'

export class CommandError extends Error {}

export interface CommandContext {
  correlationId?: string
  source?: RequestSource
}

export class CommandService {
  constructor(
    private readonly session: SessionService,
    private readonly history = new PatchHistory(),
    private readonly trace = new LatencyTrace(false),
  ) {}

  applyPatch(commandInput: ApplyPatchCommand, context: CommandContext = {}): CommandResult {
    const correlationId = context.correlationId ?? this.trace.createCorrelationId()
    const source = context.source ?? 'ui'
    this.trace.record(correlationId, 'request_received', source)

    const command = parseApplyPatchCommand(commandInput)
    const before = this.session.getPatch()
    const nextPatch = applyPatchChanges(before, command)
    const commandPaths = command.changes.map((change) => change.path)
    const changed = diffSupportedPaths(before, nextPatch, commandPaths)

    if (Object.keys(changed).length === 0) {
      throw new CommandError('The command did not change any patch values')
    }

    this.history.push({ before, after: nextPatch, changed, reason: command.reason })
    this.session.commit(
      {
        patch: nextPatch,
        changed,
        correlationId,
        reason: command.reason,
        source,
        kind: 'command',
      },
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return {
      patch: this.session.getPatch(),
      changed,
      summary: summarizePatch(nextPatch),
      canUndo: this.history.canUndo,
      correlationId,
    }
  }

  setLfoShape(commandInput: SetLfoShapeCommand, context: CommandContext = {}): CommandResult {
    return this.applyPatch(
      createSetLfoShapeTransaction(commandInput, this.session.getPatch()),
      context,
    )
  }

  undo(context: CommandContext = {}): CommandResult {
    const correlationId = context.correlationId ?? this.trace.createCorrelationId()
    const source = context.source ?? 'history'
    this.trace.record(correlationId, 'request_received', source)

    const entry = this.history.pop()
    if (!entry) throw new CommandError('There is no patch transaction to undo')

    const current = this.session.getPatch()
    const changed = diffSupportedPaths(current, entry.before, SUPPORTED_PATCH_PATHS)
    this.session.commit(
      {
        patch: entry.before,
        changed,
        correlationId,
        reason: `Undo: ${entry.reason}`,
        source,
        kind: 'undo',
      },
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return {
      patch: this.session.getPatch(),
      changed,
      summary: summarizePatch(entry.before),
      canUndo: this.history.canUndo,
      correlationId,
    }
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get historySize(): number {
    return this.history.size
  }
}
