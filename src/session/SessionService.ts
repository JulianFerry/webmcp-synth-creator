import { PatchHistory, type HistoryEntry } from '../commands/history'
import { parsePatchState } from '../patch/schemas'
import type { PatchState } from '../patch/types'
import type { PatchDiff } from '../commands/diff'
import type { RequestSource } from '../dev/latencyTrace'

export type VariantId = 'A' | 'B'

export interface VariantState {
  present: PatchState
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export interface SessionState {
  variants: { A: VariantState; B?: VariantState }
  currentVariant: VariantId
}

export interface SessionSummary {
  currentVariant: VariantId
  hasVariantB: boolean
  canUndo: boolean
  canRedo: boolean
}

export interface SessionCommitInput {
  patch: PatchState
  changed: PatchDiff
  correlationId: string
  reason: string
  source: RequestSource
  kind:
    | 'command'
    | 'patch_create'
    | 'preset_load'
    | 'undo'
    | 'redo'
    | 'variant_create'
    | 'variant_select'
    | 'variant_discard'
}

export interface SessionCommitEvent extends SessionCommitInput {
  currentVariant: VariantId
}

interface StoredVariantState {
  present: PatchState
  history: PatchHistory
}

type SessionSubscriber = (event: SessionCommitEvent) => void

function patchesEqual(left: PatchState, right: PatchState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export type SessionErrorCode =
  | 'VARIANT_B_EXISTS'
  | 'VARIANT_B_UNAVAILABLE'
  | 'UNDO_UNAVAILABLE'
  | 'REDO_UNAVAILABLE'
  | 'INVALID_SESSION_TRANSITION'

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SessionError'
  }
}

export class SessionService {
  private readonly variants: { A: StoredVariantState; B?: StoredVariantState }
  private currentVariant: VariantId = 'A'
  private historyLimit: number
  private readonly subscribers = new Set<SessionSubscriber>()

  constructor(
    initialPatch: PatchState,
    private readonly onSubscriberError: (error: unknown) => void = () => undefined,
    historyLimit = 30,
  ) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1) {
      throw new RangeError('History limit must be a positive integer')
    }
    this.historyLimit = historyLimit
    this.variants = {
      A: {
        present: structuredClone(parsePatchState(initialPatch)),
        history: new PatchHistory(historyLimit),
      },
    }
  }

  attachInitialHistory(history: PatchHistory): void {
    const variantA = this.variants.A
    if (variantA.history.size > 0 || variantA.history.futureSize > 0) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'Cannot replace history after the session has changed',
      )
    }
    variantA.history = history
    this.historyLimit = history.limit
  }

  getPatch(variantId: VariantId = this.currentVariant): PatchState {
    return structuredClone(this.getVariant(variantId).present)
  }

  getState(): SessionState {
    const state: SessionState = {
      variants: {
        A: this.toVariantState(this.variants.A),
      },
      currentVariant: this.currentVariant,
    }
    if (this.variants.B) state.variants.B = this.toVariantState(this.variants.B)
    return state
  }

  getSummary(): SessionSummary {
    const history = this.getActiveHistory()
    return {
      currentVariant: this.currentVariant,
      hasVariantB: this.variants.B !== undefined,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    }
  }

  hasVariant(variantId: VariantId): boolean {
    return variantId === 'A' || this.variants.B !== undefined
  }

  private getActiveHistory(): PatchHistory {
    return this.getVariant(this.currentVariant).history
  }

  getHistoryDepth(): { past: number; future: number } {
    const history = this.getActiveHistory()
    return { past: history.size, future: history.futureSize }
  }

  peekUndo(): HistoryEntry | undefined {
    return this.getActiveHistory().peekUndo()
  }

  peekRedo(): HistoryEntry | undefined {
    return this.getActiveHistory().peekRedo()
  }

  subscribe(subscriber: SessionSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  commitTransaction(
    event: SessionCommitInput,
    historyEntry: HistoryEntry,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    const patch = structuredClone(parsePatchState(event.patch))
    const variant = this.getVariant(this.currentVariant)
    if (!patchesEqual(historyEntry.before, variant.present)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'History entry does not start from the active variant',
      )
    }
    if (!patchesEqual(historyEntry.after, patch)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'History entry does not end at the committed patch',
      )
    }

    variant.history.push(historyEntry)
    variant.present = patch
    this.publish(event, afterStateUpdate)
  }

  commitHistory(
    direction: 'undo' | 'redo',
    event: SessionCommitInput,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    const patch = structuredClone(parsePatchState(event.patch))
    const variant = this.getVariant(this.currentVariant)
    const entry = direction === 'undo' ? variant.history.peekUndo() : variant.history.peekRedo()
    if (!entry) {
      throw new SessionError(
        direction === 'undo' ? 'UNDO_UNAVAILABLE' : 'REDO_UNAVAILABLE',
        `There is no patch transaction to ${direction} on variant ${this.currentVariant}`,
      )
    }

    const expectedPatch = direction === 'undo' ? entry.before : entry.after
    if (!patchesEqual(expectedPatch, patch)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        `The ${direction} target does not match active variant history`,
      )
    }

    if (direction === 'undo') variant.history.undo()
    else variant.history.redo()
    variant.present = patch
    this.publish(event, afterStateUpdate)
  }

  createVariantB(
    basePatch: PatchState,
    event: SessionCommitInput,
    historyEntry: HistoryEntry,
    replaceExisting = false,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    if (this.variants.B && !replaceExisting) {
      throw new SessionError(
        'VARIANT_B_EXISTS',
        'Variant B already exists. Set replaceExisting to true to replace it explicitly.',
      )
    }

    const activePatch = this.getPatch()
    const parsedBase = structuredClone(parsePatchState(basePatch))
    const patch = structuredClone(parsePatchState(event.patch))
    if (!patchesEqual(activePatch, parsedBase)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'Variant B must clone the active patch',
      )
    }
    if (!patchesEqual(historyEntry.before, parsedBase) || !patchesEqual(historyEntry.after, patch)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'Variant B history must contain its atomic creation edit',
      )
    }

    const history = new PatchHistory(this.historyLimit)
    history.push(historyEntry)
    this.variants.B = { present: patch, history }
    this.currentVariant = 'B'
    this.publish(event, afterStateUpdate)
  }

  selectVariant(
    variantId: VariantId,
    event: SessionCommitInput,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    const variant = this.getVariant(variantId)
    const patch = structuredClone(parsePatchState(event.patch))
    if (!patchesEqual(variant.present, patch)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'Selected variant does not match the supplied patch',
      )
    }

    this.currentVariant = variantId
    this.publish(event, afterStateUpdate)
  }

  discardVariantB(
    event: SessionCommitInput,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    if (!this.variants.B) {
      throw new SessionError('VARIANT_B_UNAVAILABLE', 'Variant B does not exist')
    }
    const patch = structuredClone(parsePatchState(event.patch))
    if (!patchesEqual(this.variants.A.present, patch)) {
      throw new SessionError(
        'INVALID_SESSION_TRANSITION',
        'Discarding variant B must return to variant A',
      )
    }
    delete this.variants.B
    this.currentVariant = 'A'
    this.publish(event, afterStateUpdate)
  }

  private getVariant(variantId: VariantId): StoredVariantState {
    const variant = this.variants[variantId]
    if (!variant) {
      throw new SessionError('VARIANT_B_UNAVAILABLE', `Variant ${variantId} does not exist`)
    }
    return variant
  }

  private toVariantState(variant: StoredVariantState): VariantState {
    return {
      present: structuredClone(variant.present),
      past: variant.history.getPast(),
      future: variant.history.getFuture(),
    }
  }

  private publish(event: SessionCommitInput, afterStateUpdate: () => void): void {
    afterStateUpdate()
    const publishedEvent: SessionCommitEvent = {
      ...structuredClone(event),
      patch: this.getPatch(),
      currentVariant: this.currentVariant,
    }

    for (const subscriber of this.subscribers) {
      try {
        subscriber(structuredClone(publishedEvent))
      } catch (error) {
        this.onSubscriberError(error)
      }
    }
  }
}
