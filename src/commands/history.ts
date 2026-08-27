import type { PatchState } from '../patch/types'
import type { PatchDiff } from './diff'

export interface HistoryEntry {
  before: PatchState
  after: PatchState
  changed: PatchDiff
  reason: string
}

export class PatchHistory {
  private readonly entries: HistoryEntry[] = []

  constructor(private readonly limit = 30) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('History limit must be a positive integer')
    }
  }

  push(entry: HistoryEntry): void {
    this.entries.push(structuredClone(entry))
    if (this.entries.length > this.limit) this.entries.shift()
  }

  pop(): HistoryEntry | undefined {
    const entry = this.entries.pop()
    return entry ? structuredClone(entry) : undefined
  }

  get canUndo(): boolean {
    return this.entries.length > 0
  }

  get size(): number {
    return this.entries.length
  }
}
