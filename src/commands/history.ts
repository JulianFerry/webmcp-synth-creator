import type { PatchState } from '../patch/types'
import type { ImportedVitalBacking } from '../vital/VitalPresetAdapter'
import type { PatchDiff } from './diff'

export interface HistoryEntry {
  before: PatchState
  after: PatchState
  changed: PatchDiff
  reason: string
  vitalBackingTransition?: {
    before: ImportedVitalBacking | null
    after: ImportedVitalBacking | null
  }
}

export class PatchHistory {
  private readonly past: HistoryEntry[] = []
  private readonly future: HistoryEntry[] = []

  constructor(readonly limit = 30) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('History limit must be a positive integer')
    }
  }

  push(entry: HistoryEntry): void {
    this.past.push(cloneHistoryEntry(entry))
    this.future.length = 0
    if (this.past.length > this.limit) this.past.shift()
  }

  peekUndo(): HistoryEntry | undefined {
    const entry = this.past.at(-1)
    return entry ? cloneHistoryEntry(entry) : undefined
  }

  peekRedo(): HistoryEntry | undefined {
    const entry = this.future.at(-1)
    return entry ? cloneHistoryEntry(entry) : undefined
  }

  undo(): HistoryEntry | undefined {
    const entry = this.past.pop()
    if (!entry) return undefined
    this.future.push(entry)
    return cloneHistoryEntry(entry)
  }

  redo(): HistoryEntry | undefined {
    const entry = this.future.pop()
    if (!entry) return undefined
    this.past.push(entry)
    if (this.past.length > this.limit) this.past.shift()
    return cloneHistoryEntry(entry)
  }

  pop(): HistoryEntry | undefined {
    return this.undo()
  }

  getPast(): HistoryEntry[] {
    return this.past.map(publicHistoryEntry)
  }

  getFuture(): HistoryEntry[] {
    return this.future.map(publicHistoryEntry)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get size(): number {
    return this.past.length
  }

  get futureSize(): number {
    return this.future.length
  }
}

function publicHistoryEntry(entry: HistoryEntry): HistoryEntry {
  const publicEntry = cloneHistoryEntry(entry)
  delete publicEntry.vitalBackingTransition
  return publicEntry
}

function cloneHistoryEntry(entry: HistoryEntry): HistoryEntry {
  const cloned = structuredClone({
    before: entry.before,
    after: entry.after,
    changed: entry.changed,
    reason: entry.reason,
  })
  return entry.vitalBackingTransition === undefined
    ? cloned
    : { ...cloned, vitalBackingTransition: entry.vitalBackingTransition }
}
