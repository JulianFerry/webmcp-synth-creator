import { describe, expect, it } from 'vitest'

import { VoiceAllocator } from '../../src/audio/VoiceAllocator'

describe('VoiceAllocator', () => {
  it('steals the oldest active voice when the polyphony limit is reached', () => {
    const allocator = new VoiceAllocator<string>(2)
    allocator.claim(60, 0.7, 10, 'C4')
    allocator.claim(64, 0.8, 11, 'E4')

    const result = allocator.claim(67, 0.9, 12, 'G4')

    expect(result.stolen).toMatchObject({ midi: 60, voice: 'C4' })
    expect(allocator.activeCount).toBe(2)
    expect(allocator.activeNotes).toEqual([64, 67])
  })

  it('releases note ownership and trims oldest voices when the limit changes', () => {
    const allocator = new VoiceAllocator<string>(3)
    allocator.claim(60, 0.7, 10, 'C4')
    allocator.claim(64, 0.8, 11, 'E4')
    allocator.claim(67, 0.9, 12, 'G4')

    expect(allocator.releaseNote(64)).toEqual([
      expect.objectContaining({ midi: 64, voice: 'E4' }),
    ])
    expect(allocator.activeNotes).toEqual([60, 67])

    const trimmed = allocator.setLimit(1)
    expect(trimmed).toEqual([expect.objectContaining({ midi: 60, voice: 'C4' })])
    expect(allocator.activeNotes).toEqual([67])
    expect(allocator.releaseAll()).toEqual([
      expect.objectContaining({ midi: 67, voice: 'G4' }),
    ])
    expect(allocator.activeCount).toBe(0)
  })

  it('rejects invalid polyphony limits', () => {
    expect(() => new VoiceAllocator(0)).toThrow(/positive integer/)
    const allocator = new VoiceAllocator(2)
    expect(() => allocator.setLimit(1.5)).toThrow(/positive integer/)
  })
})
