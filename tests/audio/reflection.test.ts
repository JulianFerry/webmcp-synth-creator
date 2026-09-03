import { describe, expect, it } from 'vitest'

import { patchReflection } from '../../src/audio/reflection'
import { createDefaultPatch } from '../../src/patch/defaults'

describe('audio patch reflection', () => {
  it('reflects all three oscillators and preserves the complete effect order', () => {
    const patch = createDefaultPatch()
    patch.oscillators[2] = {
      ...patch.oscillators[2],
      enabled: true,
      wavetablePosition: 0.73,
      level: 0.41,
      transposeSemitones: -12,
    }
    patch.effects.order = ['reverb', 'delay', 'chorus', 'compressor', 'filter', 'distortion']

    const reflection = patchReflection(patch)

    expect(reflection.oscillators).toHaveLength(3)
    expect(reflection.oscillators[2]).toMatchObject({
      enabled: true,
      wavetablePosition: 0.73,
      level: 0.41,
      transposeSemitones: -12,
    })
    expect(reflection.effects.order).toEqual([
      'reverb',
      'delay',
      'chorus',
      'compressor',
      'filter',
      'distortion',
    ])
  })
})
