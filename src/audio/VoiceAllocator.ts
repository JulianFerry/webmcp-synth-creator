export interface VoiceSlot<T> {
  id: number
  midi: number
  velocity: number
  startedAt: number
  voice: T
}

export interface VoiceClaim<T> {
  claimed: VoiceSlot<T>
  stolen: VoiceSlot<T> | null
}

export class VoiceAllocator<T> {
  private readonly slots: VoiceSlot<T>[] = []
  private nextId = 1

  constructor(private limit: number) {
    this.assertLimit(limit)
  }

  claim(midi: number, velocity: number, startedAt: number, voice: T): VoiceClaim<T> {
    let stolen: VoiceSlot<T> | null = null
    if (this.slots.length >= this.limit) {
      stolen = this.removeOldest()
    }

    const claimed = {
      id: this.nextId,
      midi,
      velocity,
      startedAt,
      voice,
    }
    this.nextId += 1
    this.slots.push(claimed)
    return { claimed: { ...claimed }, stolen: stolen ? { ...stolen } : null }
  }

  releaseNote(midi: number): VoiceSlot<T>[] {
    const released = this.slots.filter((slot) => slot.midi === midi)
    for (let index = this.slots.length - 1; index >= 0; index -= 1) {
      if (this.slots[index].midi === midi) this.slots.splice(index, 1)
    }
    return released.map((slot) => ({ ...slot }))
  }

  setLimit(limit: number): VoiceSlot<T>[] {
    this.assertLimit(limit)
    this.limit = limit
    const stolen: VoiceSlot<T>[] = []
    while (this.slots.length > this.limit) {
      const slot = this.removeOldest()
      if (slot) stolen.push({ ...slot })
    }
    return stolen
  }

  releaseAll(): VoiceSlot<T>[] {
    return this.slots.splice(0).map((slot) => ({ ...slot }))
  }

  get activeCount(): number {
    return this.slots.length
  }

  get activeNotes(): number[] {
    return this.slots.map((slot) => slot.midi)
  }

  forEach(callback: (slot: VoiceSlot<T>) => void): void {
    this.slots.forEach((slot) => callback({ ...slot }))
  }

  private removeOldest(): VoiceSlot<T> | null {
    if (this.slots.length === 0) return null
    let oldestIndex = 0
    for (let index = 1; index < this.slots.length; index += 1) {
      const candidate = this.slots[index]
      const oldest = this.slots[oldestIndex]
      if (candidate.startedAt < oldest.startedAt) oldestIndex = index
    }
    return this.slots.splice(oldestIndex, 1)[0] ?? null
  }

  private assertLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Polyphony limit must be a positive integer')
    }
  }
}
