import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { normalizedToCutoffHz, normalizedToGlideSeconds, normalizedToReverbDecaySeconds } from '../../src/ops/normalization'
import { resolveOps, type Change } from '../../src/ops/resolve'
import { FLAT_GATE_PATTERN, GATE_PATTERNS } from '../../src/ops/patterns'
import { MOVEMENT_SHAPES } from '../../src/ops/shapes'

const patch = () => createDefaultPatch()
const paths = (change: Change) => resolveOps(patch(), [change]).map(({ path }) => path)

describe('Phase 5 operation resolver exact emitted paths', () => {
  it('tone emits only its required paths and optional resonance when present', () => {
    expect(paths({ op: 'tone', brightness: 0.5 })).toEqual([
      'filter.enabled', 'filter.type', 'filter.slope', 'filter.cutoffHz',
    ])
    expect(resolveOps(patch(), [{ op: 'tone', brightness: 0.5, keep_air: true, resonance: 0.3 }])).toEqual([
      { path: 'filter.enabled', value: true }, { path: 'filter.type', value: 'lowpass' },
      { path: 'filter.slope', value: 12 }, { path: 'filter.cutoffHz', value: normalizedToCutoffHz(0.58) },
      { path: 'filter.resonance', value: 0.3 },
    ])
  })

  it('articulation emits exactly the seven named envelope fields', () => {
    expect(paths({ op: 'articulation', kind: 'pluck' })).toEqual([
      'ampEnvelope.delaySeconds', 'ampEnvelope.attackSeconds', 'ampEnvelope.holdSeconds',
      'ampEnvelope.decaySeconds', 'ampEnvelope.sustainLevel', 'ampEnvelope.releaseSeconds', 'ampEnvelope.decayCurve',
    ])
    expect(resolveOps(patch(), [{ op: 'articulation', kind: 'pluck', speed: 0.5 }])).toMatchObject([
      { value: 0 }, { value: 0 }, { value: 0 }, { value: 0.18 }, { value: 0 }, { value: 0.12 }, { value: -0.6 },
    ])
  })

  it('timbre emits enabled, wavetable, and position only for selected targets', () => {
    expect(paths({ op: 'timbre', character: 'warm' })).toEqual([
      'oscillators.0.enabled', 'oscillators.0.wavetableId', 'oscillators.0.wavetablePosition',
    ])
    expect(paths({ op: 'timbre', character: 'harsh', target: 'all' })).toEqual([
      'oscillators.0.enabled', 'oscillators.0.wavetableId', 'oscillators.0.wavetablePosition',
      'oscillators.1.enabled', 'oscillators.1.wavetableId', 'oscillators.1.wavetablePosition',
      'oscillators.2.enabled', 'oscillators.2.wavetableId', 'oscillators.2.wavetablePosition',
    ])
  })

  it('width emits the literal path set for each method and auto threshold', () => {
    expect(paths({ op: 'width', amount: 0.5 })).toEqual([
      'oscillators.0.unisonVoices', 'oscillators.0.unisonDetune', 'oscillators.0.stereoSpread',
    ])
    expect(paths({ op: 'width', amount: 0.6 })).toEqual([
      'oscillators.0.unisonVoices', 'oscillators.0.unisonDetune', 'oscillators.0.stereoSpread',
      'effects.chorus.enabled', 'effects.chorus.mix',
    ])
    expect(paths({ op: 'width', amount: 1, method: 'pan' })).toEqual(['oscillators.0.pan', 'oscillators.1.pan'])
    expect(paths({ op: 'width', amount: 1, method: 'stereo_fx' })).toEqual(['effects.chorus.enabled', 'effects.chorus.mix'])
  })

  it('space emits reverb paths and delay paths only when delay_amount is given', () => {
    expect(paths({ op: 'space', amount: 0.4 })).toEqual([
      'effects.reverb.enabled', 'effects.reverb.mix', 'effects.reverb.decaySeconds', 'effects.reverb.predelay',
    ])
    expect(resolveOps(patch(), [{ op: 'space', amount: 0.4, size: 0.8, predelay: 0.2, delay_amount: 0.5 }])).toEqual([
      { path: 'effects.reverb.enabled', value: true }, { path: 'effects.reverb.mix', value: 0.4 * 0.75 },
      { path: 'effects.reverb.size', value: 0.8 }, { path: 'effects.reverb.decaySeconds', value: normalizedToReverbDecaySeconds(0.5) },
      { path: 'effects.reverb.predelay', value: 0.2 }, { path: 'effects.delay.enabled', value: true },
      { path: 'effects.delay.mix', value: 0.3 }, { path: 'effects.delay.mode', value: 'sync' },
      { path: 'effects.delay.division', value: '1/8' }, { path: 'effects.delay.feedback', value: 0.4 },
    ])
  })

  it('drive emits exactly distortion and filter drive paths', () => {
    expect(paths({ op: 'drive', amount: 0.5 })).toEqual([
      'effects.distortion.enabled', 'effects.distortion.type', 'effects.distortion.drive',
      'effects.distortion.mix', 'filter.drive',
    ])
  })

  it('movement emits only its declared LFO 2 fields', () => {
    expect(paths({ op: 'movement', amount: 0.5 })).toEqual([
      'lfo2.enabled', 'lfo2.points', 'lfo2.rate', 'lfo2.smoothing',
      'lfo2.target', 'lfo2.scope', 'lfo2.depth',
    ])
    const result = resolveOps(patch(), [{ op: 'movement', amount: 0.5, target: 'pitch', scope: 2, shape: 'triangle', sync: false, rate: 0.5 }])
    expect(result.find(({ path }) => path === 'lfo2.points')?.value).toEqual(MOVEMENT_SHAPES.triangle)
    expect(result).toContainEqual({ path: 'lfo2.target', value: 'pitch' })
    expect(result).toContainEqual({ path: 'lfo2.scope', value: 2 })
    expect(result).toContainEqual({ path: 'lfo2.depth', value: 0.5 })
  })

  it('gate emits only its declared LFO 1 fields, including none', () => {
    expect(paths({ op: 'gate', pattern: 'even_8' })).toEqual([
      'lfo1.enabled', 'lfo1.points', 'lfo1.rate', 'lfo1.smoothing',
      'lfo1.target', 'lfo1.scope', 'lfo1.depth',
    ])
    expect(paths({ op: 'gate', pattern: 'none' })).toEqual([
      'lfo1.enabled', 'lfo1.points', 'lfo1.rate', 'lfo1.smoothing',
      'lfo1.target', 'lfo1.scope', 'lfo1.depth',
    ])
    expect(resolveOps(patch(), [{ op: 'gate', pattern: 'swung' }])
      .find(({ path }) => path === 'lfo1.points')?.value).toEqual(GATE_PATTERNS.swung)
    const none = resolveOps(patch(), [{ op: 'gate', pattern: 'none' }])
    expect(none.find(({ path }) => path === 'lfo1.points')?.value).toEqual(FLAT_GATE_PATTERN)
    expect(none).toContainEqual({ path: 'lfo1.target', value: 'level' })
    expect(none).toContainEqual({ path: 'lfo1.scope', value: 'all' })
    expect(none).toContainEqual({ path: 'lfo1.depth', value: 0.85 })
  })

  it('balance emits only arguments supplied and enable writes only for osc2/osc3', () => {
    expect(paths({ op: 'balance', osc1: 0.2 })).toEqual(['oscillators.0.level'])
    expect(paths({ op: 'balance', osc2: 0, osc3: 0.4 })).toEqual([
      'oscillators.1.level', 'oscillators.1.enabled', 'oscillators.2.level', 'oscillators.2.enabled',
    ])
    expect(paths({ op: 'balance' })).toEqual([])
  })

  it('layer emits exactly its oscillator-2 block, with a minimal none block', () => {
    expect(paths({ op: 'layer', role: 'sub' })).toEqual([
      'oscillators.1.enabled', 'oscillators.1.transposeSemitones',
      'oscillators.1.unisonVoices', 'oscillators.1.unisonDetune', 'oscillators.1.wavetableId',
    ])
    expect(paths({ op: 'layer', role: 'sub', level: 0.2 })).toEqual([
      'oscillators.1.enabled', 'oscillators.1.transposeSemitones', 'oscillators.1.unisonVoices',
      'oscillators.1.unisonDetune', 'oscillators.1.wavetableId', 'oscillators.1.level',
    ])
    expect(paths({ op: 'layer', role: 'none' })).toEqual(['oscillators.1.level', 'oscillators.1.enabled'])
  })

  it('pitch emits exactly the four specified voice paths', () => {
    expect(paths({ op: 'pitch' })).toEqual([
      'voice.transposeSemitones', 'voice.glideSeconds', 'voice.polyphony', 'voice.legato',
    ])
    expect(resolveOps(patch(), [{ op: 'pitch', octave: 3, semitones: 12, glide: 0.5, mono: true }])).toEqual([
      { path: 'voice.transposeSemitones', value: 36 }, { path: 'voice.glideSeconds', value: normalizedToGlideSeconds(0.5) },
      { path: 'voice.polyphony', value: 1 }, { path: 'voice.legato', value: true },
    ])
  })

  it('response emits only supplied dynamics paths and removes a zero route', () => {
    expect(paths({ op: 'response', velocity_to_level: 0.7, keytrack: 0.4 })).toEqual([
      'voice.velocitySensitivity', 'filter.keytrack',
    ])
    expect(paths({ op: 'response', velocity_to_cutoff: 0.5 })).toEqual(['filter.velocityToCutoff'])
    expect(paths({ op: 'response' })).toEqual([])
  })

  it('keeps gate and movement on independent LFO slots in one apply_patch resolution', () => {
    const result = resolveOps(patch(), [
      { op: 'gate', pattern: 'even_8', depth: 0.7 },
      { op: 'movement', amount: 0.4, target: 'cutoff' },
    ])
    expect(result.map(({ path }) => path)).toEqual([
      'lfo1.enabled', 'lfo1.points', 'lfo1.rate', 'lfo1.smoothing', 'lfo1.target', 'lfo1.scope', 'lfo1.depth',
      'lfo2.enabled', 'lfo2.points', 'lfo2.rate', 'lfo2.smoothing', 'lfo2.target', 'lfo2.scope', 'lfo2.depth',
    ])
  })

  it('merges duplicate paths last-write-wins, including raw precision overrides', () => {
    expect(resolveOps(patch(), [
      { op: 'drive', amount: 1 }, { op: 'tone', brightness: 0.5 }, { path: 'filter.drive', value: 0.123 },
    ])).toContainEqual({ path: 'filter.drive', value: 0.123 })
    expect(resolveOps(patch(), [
      { op: 'drive', amount: 1 }, { op: 'tone', brightness: 0.5 }, { path: 'filter.drive', value: 0.123 },
    ]).filter(({ path }) => path === 'filter.drive')).toHaveLength(1)
  })
})
