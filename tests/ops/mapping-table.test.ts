import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { normalizedToCutoffHz, normalizedToGlideSeconds, normalizedToLfoDivision, normalizedToLfoHz, normalizedToReverbDecaySeconds } from '../../src/ops/normalization'
import { resolveOps, type Change } from '../../src/ops/resolve'

const resolve = (change: Change) => resolveOps(createDefaultPatch(), [change])
const asRecord = (change: Change) => Object.fromEntries(resolve(change).map(({ path, value }) => [path, value]))

describe('literal section 6 operation mapping table', () => {
  it.each([
    [0, false, 24, normalizedToCutoffHz(0.12)],
    [0.5, false, 24, normalizedToCutoffHz(0.52)],
    [1, true, 12, normalizedToCutoffHz(0.98)],
  ] as const)('maps tone brightness %s and keep_air %s', (brightness, keep_air, slope, cutoffHz) => {
    expect(asRecord({ op: 'tone', brightness, keep_air })).toEqual({
      'filter.enabled': true, 'filter.type': 'lowpass', 'filter.slope': slope, 'filter.cutoffHz': cutoffHz,
    })
  })

  it.each([
    ['pluck', 0, 0, 0, 0.18, 0, 0.12, -0.6], ['stab', 0, 0, 0, 0.1, 0, 0.06, -0.7],
    ['percussive', 0, 0, 0, 0.06, 0, 0.04, -0.8], ['keys', 0, 0, 0, 0.35, 0.45, 0.25, -0.5],
    ['bell', 0, 0, 0, 0.55, 0, 0.5, -0.8], ['pad', 0, 0.45, 0, 0.4, 0.85, 0.62, 0],
    ['swell', 0, 0.72, 0, 0.3, 0.9, 0.7, 0.3], ['sustain', 0, 0.02, 0, 0.1, 1, 0.15, 0],
    ['reverse', 0, 0.85, 0.05, 0.05, 0, 0.02, 0.5],
  ] as const)('maps articulation %s literally', (kind, delay, attack, hold, decay, sustain, release, curve) => {
    expect(asRecord({ op: 'articulation', kind, speed: 0.5 })).toEqual({
      'ampEnvelope.delaySeconds': delay, 'ampEnvelope.attackSeconds': attack,
      'ampEnvelope.holdSeconds': hold, 'ampEnvelope.decaySeconds': decay,
      'ampEnvelope.sustainLevel': sustain, 'ampEnvelope.releaseSeconds': release,
      'ampEnvelope.decayCurve': curve,
    })
    expect(asRecord({ op: 'articulation', kind, speed: 0 }).ampEnvelope).toBeUndefined()
    expect(asRecord({ op: 'articulation', kind, speed: 0 })['ampEnvelope.decaySeconds']).toBeCloseTo(decay * 0.25)
    expect(asRecord({ op: 'articulation', kind, speed: 1 })['ampEnvelope.releaseSeconds']).toBeCloseTo(release * 1.75)
  })

  it.each([
    ['pure', 'sine', 0], ['warm', 'warm-saw', 0.35], ['bright', 'airy', 0.7],
    ['hollow', 'soft-square', 0.3], ['vocal', 'vocal', 0.45], ['metallic', 'metallic', 0.55],
    ['glassy', 'glass', 0.4], ['harsh', 'harsh', 0.75], ['digital', 'digital', 0.5],
  ] as const)('maps timbre %s literally', (character, wavetableId, position) => {
    expect(asRecord({ op: 'timbre', character })).toEqual({
      'oscillators.0.enabled': true, 'oscillators.0.wavetableId': wavetableId,
      'oscillators.0.wavetablePosition': position,
    })
  })

  it.each([
    [1, [0]], [2, [1]], [3, [2]], ['both', [0, 1]], ['all', [0, 1, 2]],
  ] as const)('maps timbre target %s to exact oscillator paths', (target, indices) => {
    expect(resolve({ op: 'timbre', character: 'pure', target }).map(({ path }) => path)).toEqual(
      indices.flatMap((index) => [`oscillators.${index}.enabled`, `oscillators.${index}.wavetableId`, `oscillators.${index}.wavetablePosition`]),
    )
  })

  it.each([
    ['unison', ['oscillators.0.unisonVoices', 'oscillators.0.unisonDetune', 'oscillators.0.stereoSpread']],
    ['pan', ['oscillators.0.pan', 'oscillators.1.pan']],
    ['stereo_fx', ['effects.chorus.enabled', 'effects.chorus.mix']],
  ] as const)('maps width method %s to exact paths', (method, expectedPaths) => {
    const result = resolve({ op: 'width', amount: 0.75, method })
    expect(result.map(({ path }) => path)).toEqual(expectedPaths)
  })

  it('maps width, space, and drive formulas literally', () => {
    expect(asRecord({ op: 'width', amount: 0.75, method: 'unison' })).toEqual({
      'oscillators.0.unisonVoices': 7, 'oscillators.0.unisonDetune': 0.75 * 0.7,
      'oscillators.0.stereoSpread': 0.3 + 0.75 * 0.7,
    })
    expect(asRecord({ op: 'space', amount: 0.4 })).toEqual({
      'effects.reverb.enabled': true, 'effects.reverb.mix': 0.4 * 0.75,
      'effects.reverb.size': 0.3 + 0.4 * 0.5,
      'effects.reverb.decaySeconds': normalizedToReverbDecaySeconds(0.5), 'effects.reverb.predelay': 0.1,
    })
    expect(asRecord({ op: 'space', amount: 0.4, delay_amount: 0.5 })).toMatchObject({
      'effects.delay.enabled': true, 'effects.delay.mix': 0.3, 'effects.delay.mode': 'sync',
      'effects.delay.division': '1/8', 'effects.delay.feedback': 0.4,
    })
  })

  it.each([
    ['soft', 'soft_clip'], ['hard', 'hard_clip'], ['fold', 'sine_fold'], ['crush', 'bit_crush'],
  ] as const)('maps drive character %s', (character, type) => {
    expect(asRecord({ op: 'drive', amount: 0.5, character })).toEqual({
      'effects.distortion.enabled': true, 'effects.distortion.type': type,
      'effects.distortion.drive': 0.5, 'effects.distortion.mix': 0.7, 'filter.drive': 0.2,
    })
  })

  it.each(['position', 'cutoff', 'pitch', 'level'] as const)('maps movement target %s', (target) => {
    const record = asRecord({ op: 'movement', amount: 0.5, target })
    expect(Object.keys(record)).toEqual(['lfo2.enabled', 'lfo2.points', 'lfo2.rate', 'lfo2.smoothing', 'lfo2.target', 'lfo2.scope', 'lfo2.depth'])
    expect(record).toMatchObject({ 'lfo2.target': target, 'lfo2.scope': 'all', 'lfo2.depth': 0.5 })
  })

  it.each(['sine', 'triangle', 'ramp_up', 'ramp_down', 'random', 'smooth_random'] as const)('maps movement shape %s', (shape) => {
    expect(asRecord({ op: 'movement', amount: 1, shape })['lfo2.points']).toEqual(expect.any(Array))
  })

  it('maps movement synchronized and free rates literally', () => {
    expect(asRecord({ op: 'movement', amount: 1, rate: 0.75 })['lfo2.rate']).toEqual({ mode: 'sync', division: normalizedToLfoDivision(0.75) })
    expect(asRecord({ op: 'movement', amount: 1, rate: 0.75, sync: false })['lfo2.rate']).toEqual({ mode: 'free', hz: normalizedToLfoHz(0.75) })
  })

  it.each(['level', 'position', 'pitch', 'cutoff'] as const)('maps gate target %s to declared state', (target) => {
    expect(asRecord({ op: 'gate', pattern: 'even_8', depth: 0.6, target })).toMatchObject({
      'lfo1.target': target, 'lfo1.scope': 'all', 'lfo1.depth': 0.6,
    })
  })

  it.each([
    ['sub', -12, 0.35, 1, 0, 'sine'], ['octave_up', 12, 0.22, 1, 0, createDefaultPatch().oscillators[0].wavetableId],
    ['fifth', 7, 0.18, 1, 0, createDefaultPatch().oscillators[0].wavetableId],
    ['unison_detune', 0, 0.45, 3, 0.4, createDefaultPatch().oscillators[0].wavetableId],
  ] as const)('maps layer role %s with its default level', (role, transpose, level, voices, detune, wavetable) => {
    expect(asRecord({ op: 'layer', role })).toEqual({
      'oscillators.1.enabled': true, 'oscillators.1.transposeSemitones': transpose,
      'oscillators.1.unisonVoices': voices, 'oscillators.1.unisonDetune': detune,
      'oscillators.1.wavetableId': wavetable, 'oscillators.1.level': level,
    })
  })

  it('maps balance, pitch, and response formulas and optional paths literally', () => {
    expect(asRecord({ op: 'balance', osc1: 0.1, osc2: 0, osc3: 0.8 })).toEqual({
      'oscillators.0.level': 0.1, 'oscillators.1.level': 0, 'oscillators.1.enabled': false,
      'oscillators.2.level': 0.8, 'oscillators.2.enabled': true,
    })
    expect(asRecord({ op: 'pitch', octave: -2, semitones: 3, glide: 0.4, mono: true })).toEqual({
      'voice.transposeSemitones': -21, 'voice.glideSeconds': normalizedToGlideSeconds(0.4),
      'voice.polyphony': 1, 'voice.legato': true,
    })
    expect(Object.keys(asRecord({ op: 'response', velocity_to_level: 0.2, keytrack: 0.7 }))).toEqual(['voice.velocitySensitivity', 'filter.keytrack'])
  })
})
