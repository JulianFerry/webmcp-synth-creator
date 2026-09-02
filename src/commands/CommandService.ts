import { LatencyTrace, type RequestSource } from '../dev/latencyTrace'
import { parseApplyPatchCommand } from '../patch/schemas'
import { summarizePatch } from '../patch/summary'
import type {
  ApplyPatchCommand,
  PatchSummary,
  PatchState,
  SetLfoShapeCommand,
} from '../patch/types'
import {
  SessionError,
  SessionService,
  type SessionCommitInput,
  type SessionSummary,
  type VariantId,
} from '../session/SessionService'
import type { ImportedVitalBacking } from '../vital/VitalPresetAdapter'
import {
  createVariantTransaction,
  type CreateVariantCommand,
} from '../session/variantCommands'
import { applyPatchChanges } from './applyPatch'
import { createPatchTransaction, type CreatePatchCommand } from './createPatch'
import { diffCompletePatch, diffSupportedPaths, type PatchDiff } from './diff'
import { PatchHistory } from './history'
import { createLoadPresetTransaction, type LoadPresetCommand } from './loadPreset'
import { createSetLfoShapeTransaction } from './setLfoShape'

export class CommandError extends Error {}

export interface CommandContext {
  correlationId?: string
  source?: RequestSource
}

export interface CommandResult {
  patch: PatchState
  changed: PatchDiff
  summary: PatchSummary
  canUndo: boolean
  canRedo: boolean
  session: SessionSummary
  correlationId: string
}

export class CommandService {
  constructor(
    private readonly session: SessionService,
    history?: PatchHistory,
    private readonly trace = new LatencyTrace(false),
  ) {
    if (history) this.session.attachInitialHistory(history)
  }

  applyPatch(commandInput: ApplyPatchCommand, context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    const command = parseApplyPatchCommand(commandInput)
    const before = this.session.getPatch()
    const nextPatch = applyPatchChanges(before, command)
    const commandPaths = command.changes.map((change) => change.path)
    const changed = diffSupportedPaths(before, nextPatch, commandPaths)

    this.assertChanged(changed)
    this.session.commitTransaction(
      this.commitInput(nextPatch, changed, correlationId, command.reason, source, 'command'),
      { before, after: nextPatch, changed, reason: command.reason },
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return this.commandResult(nextPatch, changed, correlationId)
  }

  setLfoShape(commandInput: SetLfoShapeCommand, context: CommandContext = {}): CommandResult {
    return this.applyPatch(
      createSetLfoShapeTransaction(commandInput, this.session.getPatch()),
      context,
    )
  }

  createPatch(
    commandInput: CreatePatchCommand,
    context: CommandContext = {},
    vitalBacking?: ImportedVitalBacking | null,
  ): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    const before = this.session.getPatch()
    const transaction = createPatchTransaction(before, commandInput)
    this.commitReplacement(transaction, correlationId, source, 'patch_create', vitalBacking)
    return this.commandResult(transaction.patch, transaction.changed, correlationId)
  }

  loadPreset(commandInput: LoadPresetCommand, context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    const before = this.session.getPatch()
    const transaction = createLoadPresetTransaction(before, commandInput)
    this.commitReplacement(transaction, correlationId, source, 'preset_load', null)
    return this.commandResult(transaction.patch, transaction.changed, correlationId)
  }

  createVariant(commandInput: CreateVariantCommand, context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    if (this.session.hasVariant('B') && commandInput.replaceExisting !== true) {
      throw new SessionError(
        'VARIANT_B_EXISTS',
        'Variant B already exists. Set replaceExisting to true to replace it explicitly.',
      )
    }

    const basePatch = this.session.getPatch()
    const transaction = createVariantTransaction(basePatch, commandInput)
    this.assertChanged(transaction.changed)
    this.session.createVariantB(
      basePatch,
      this.commitInput(
        transaction.patch,
        transaction.changed,
        correlationId,
        transaction.historyEntry.reason,
        source,
        'variant_create',
      ),
      transaction.historyEntry,
      transaction.replaceExisting,
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return this.commandResult(transaction.patch, transaction.changed, correlationId)
  }

  selectVariant(variantId: VariantId, context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    const before = this.session.getPatch()
    const selectedPatch = this.session.getPatch(variantId)
    const changed = diffCompletePatch(before, selectedPatch)
    this.session.selectVariant(
      variantId,
      this.commitInput(
        selectedPatch,
        changed,
        correlationId,
        `Select variant ${variantId}`,
        source,
        'variant_select',
      ),
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return this.commandResult(selectedPatch, changed, correlationId)
  }

  discardVariantB(context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'ui')
    const before = this.session.getPatch()
    const variantA = this.session.getPatch('A')
    const changed = diffCompletePatch(before, variantA)
    this.session.discardVariantB(
      this.commitInput(
        variantA,
        changed,
        correlationId,
        'Discard variant B',
        source,
        'variant_discard',
      ),
      () => this.trace.record(correlationId, 'patch_committed', source),
    )
    return this.commandResult(variantA, changed, correlationId)
  }

  undo(context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'history')
    const entry = this.session.peekUndo()
    if (!entry) throw new CommandError('There is no patch transaction to undo')

    const current = this.session.getPatch()
    const changed = diffCompletePatch(current, entry.before)
    this.session.commitHistory(
      'undo',
      this.commitInput(
        entry.before,
        changed,
        correlationId,
        `Undo: ${entry.reason}`,
        source,
        'undo',
      ),
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return this.commandResult(entry.before, changed, correlationId)
  }

  redo(context: CommandContext = {}): CommandResult {
    const { correlationId, source } = this.beginRequest(context, 'history')
    const entry = this.session.peekRedo()
    if (!entry) throw new CommandError('There is no patch transaction to redo')

    const current = this.session.getPatch()
    const changed = diffCompletePatch(current, entry.after)
    this.session.commitHistory(
      'redo',
      this.commitInput(
        entry.after,
        changed,
        correlationId,
        `Redo: ${entry.reason}`,
        source,
        'redo',
      ),
      () => this.trace.record(correlationId, 'patch_committed', source),
    )

    return this.commandResult(entry.after, changed, correlationId)
  }

  get canUndo(): boolean {
    return this.session.getSummary().canUndo
  }

  get canRedo(): boolean {
    return this.session.getSummary().canRedo
  }

  get historySize(): number {
    return this.session.getHistoryDepth().past
  }

  get futureSize(): number {
    return this.session.getHistoryDepth().future
  }

  get sessionSummary(): SessionSummary {
    return this.session.getSummary()
  }

  private beginRequest(
    context: CommandContext,
    defaultSource: RequestSource,
  ): { correlationId: string; source: RequestSource } {
    const correlationId = context.correlationId ?? this.trace.createCorrelationId()
    const source = context.source ?? defaultSource
    this.trace.record(correlationId, 'request_received', source)
    return { correlationId, source }
  }

  private commitInput(
    patch: PatchState,
    changed: PatchDiff,
    correlationId: string,
    reason: string,
    source: RequestSource,
    kind: SessionCommitInput['kind'],
    vitalBackingReplacement?: ImportedVitalBacking | null,
  ): SessionCommitInput {
    return {
      patch,
      changed,
      correlationId,
      reason,
      source,
      kind,
      ...(vitalBackingReplacement === undefined ? {} : { vitalBackingReplacement }),
    }
  }

  private commandResult(
    patch: PatchState,
    changed: PatchDiff,
    correlationId: string,
  ): CommandResult {
    const committedPatch = this.session.getPatch()
    return {
      patch: committedPatch,
      changed,
      summary: summarizePatch(patch),
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      session: this.session.getSummary(),
      correlationId,
    }
  }

  private commitReplacement(
    transaction: ReturnType<typeof createPatchTransaction>,
    correlationId: string,
    source: RequestSource,
    kind: 'patch_create' | 'preset_load',
    vitalBacking?: ImportedVitalBacking | null,
  ): void {
    if (vitalBacking === undefined || vitalBacking === null) this.assertChanged(transaction.changed)
    this.session.commitTransaction(
      this.commitInput(
        transaction.patch,
        transaction.changed,
        correlationId,
        transaction.reason,
        source,
        kind,
        vitalBacking,
      ),
      transaction.historyEntry,
      () => this.trace.record(correlationId, 'patch_committed', source),
    )
  }

  private assertChanged(changed: PatchDiff): void {
    if (Object.keys(changed).length === 0) {
      throw new CommandError('The command did not change any patch values')
    }
  }
}
