import { describe, expect, it } from 'vitest'

import { planAudioPatchUpdate } from '../../src/audio/BrowserSynth'

describe('BrowserSynth diff planning', () => {
  it('invalidates only the oscillator resources implicated by a compact diff', () => {
    const plan = planAudioPatchUpdate({
      'oscillators.0.wavetablePosition': { before: 0.2, after: 0.7 },
      'oscillators.1.transposeSemitones': { before: 0, after: 12 },
      'oscillators.1.unisonVoices': { before: 1, after: 4 },
    })

    expect(plan.oscillators[0]).toEqual({
      wavetable: false,
      position: true,
      pitch: false,
      level: false,
      unison: false,
    })
    expect(plan.oscillators[1]).toEqual({
      wavetable: false,
      position: false,
      pitch: true,
      level: false,
      unison: true,
    })
    expect(plan.envelope).toBe(false)
    expect(plan.filter).toBe(false)
  })

  it('plans envelope, filter, voice level, and polyphony updates independently', () => {
    const plan = planAudioPatchUpdate({
      'ampEnvelope.releaseSeconds': { before: 1, after: 2 },
      'filter.cutoffHz': { before: 7200, after: 3200 },
      'voice.polyphony': { before: 8, after: 4 },
      'voice.velocitySensitivity': { before: 0.3, after: 0.8 },
    })

    expect(plan.envelope).toBe(true)
    expect(plan.filter).toBe(true)
    expect(plan.polyphony).toBe(true)
    expect(plan.voiceLevel).toBe(true)
    expect(plan.oscillators.every((oscillator) => oscillator.level === false)).toBe(true)
  })
})
