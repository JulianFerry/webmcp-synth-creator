import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_EFFECT_ORDER, type EffectId } from '../../src/patch/effects'
import { createDefaultPatch } from '../../src/patch/defaults'
import type { FilterType } from '../../src/patch/types'
import {
  decodeVitalEffectOrder,
  encodeVitalEffectOrder,
  toVitalEffectIndexes,
} from '../../src/vital/effectOrder'
import {
  decodeVitalFxFilterType,
  mapVitalFxFilterType,
  VITAL_FX_FILTER_TYPES,
} from '../../src/vital/filter'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

function realAdapter(): VitalPresetAdapter {
  return new VitalPresetAdapter(
    JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')),
  )
}

describe('Vital PatchState v2 effect model', () => {
  it('locks source-derived FX filter values to controls present in the pinned fixture', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as { settings: Record<string, unknown> }

    for (const key of [
      'filter_fx_on',
      'filter_fx_cutoff',
      'filter_fx_resonance',
      'filter_fx_model',
      'filter_fx_style',
      'filter_fx_blend',
      'filter_fx_mix',
      'effect_chain_order',
    ]) {
      expect(fixture.settings).toHaveProperty(key)
    }
    expect(VITAL_FX_FILTER_TYPES['lowpass:12']).toEqual({ model: 0, style: 0, blend: 0 })
    expect(VITAL_FX_FILTER_TYPES['lowpass:24']).toEqual({ model: 0, style: 1, blend: 0 })
  })

  it.each<FilterType>(['lowpass', 'highpass', 'bandpass', 'notch'])(
    'exports and strictly imports the %s FX filter mapping',
    (type) => {
      const adapter = realAdapter()
      const patch = createDefaultPatch()
      patch.filter.type = type
      const exported = adapter.exportPatch(patch)
      const mapping = mapVitalFxFilterType(type)

      expect(exported.document.settings).toMatchObject({
        filter_1_on: 0,
        filter_2_on: 0,
        filter_fx_on: Number(patch.filter.enabled),
        filter_fx_model: mapping.model,
        filter_fx_style: mapping.style,
        filter_fx_blend: mapping.blend,
        filter_fx_mix: 1,
        eq_on: 0,
        flanger_on: 0,
        phaser_on: 0,
        osc_1_destination: 3,
        osc_2_destination: 3,
        osc_3_destination: 3,
      })
      expect(decodeVitalFxFilterType(mapping)).toEqual({ type, slope: 12 })
      expect(adapter.importPatch(exported.document).patch.filter).toEqual(patch.filter)
    },
  )

  it('exports and imports reordered modeled processors while keeping unmodeled effects last', () => {
    const adapter = realAdapter()
    const patch = createDefaultPatch()
    patch.effects.order = ['reverb', 'filter', 'delay', 'chorus', 'compressor', 'distortion']
    const exported = adapter.exportPatch(patch)
    const encoded = exported.document.settings.effect_chain_order as number

    expect(encoded).toBe(encodeVitalEffectOrder(patch.effects.order))
    expect(decodeVitalEffectOrder(encoded)).toEqual(patch.effects.order)
    expect(toVitalEffectIndexes(patch.effects.order).slice(-3)).toEqual([4, 6, 7])
    expect(adapter.importPatch(exported.document).patch.effects.order).toEqual(patch.effects.order)
  })

  it('derives filter and order control operations from the same export mappings', () => {
    const adapter = realAdapter()
    const before = createDefaultPatch()
    const after = structuredClone(before)
    after.filter.type = 'notch'
    after.filter.cutoffHz = 1_600
    after.filter.resonance = 0.73
    after.effects.order = [...DEFAULT_EFFECT_ORDER].reverse() as EffectId[]
    const operations = adapter.controlOperations(before, after)

    expect(operations).toEqual(
      expect.arrayContaining([
        { name: 'filter_fx_cutoff', value: expect.any(Number) },
        { name: 'filter_fx_resonance', value: 0.73 },
        { name: 'filter_fx_style', value: 2 },
        { name: 'filter_fx_blend', value: 1 },
        { name: 'effect_chain_order', value: encodeVitalEffectOrder(after.effects.order) },
      ]),
    )
    expect(operations.some(({ name }) => name.startsWith('filter_1_'))).toBe(false)
  })

  it('replaces preset-specific filter modulation with fixed global LFO routing', () => {
    const patch = createDefaultPatch()
    patch.modulations = [
      {
        id: 'env-filter',
        source: 'modEnvelope',
        destination: 'filter.cutoff',
        amount: 0.45,
        bipolar: false,
      },
    ]
    const settings = realAdapter().exportPatch(patch).document.settings
    const routes = settings.modulations as Array<Record<string, unknown>>

    expect(routes.slice(0, 3)).toEqual([
      { source: 'lfo_1', destination: 'osc_1_level' },
      { source: 'lfo_1', destination: 'osc_2_level' },
      { source: 'lfo_1', destination: 'osc_3_level' },
    ])
    expect(routes).not.toContainEqual({ source: 'env_2', destination: 'filter_fx_cutoff' })
  })

  it('strictly round-trips all PatchState v3 Vital scalars', () => {
    const adapter = realAdapter()
    const patch = createDefaultPatch()
    patch.ampEnvelope = {
      ...patch.ampEnvelope,
      delaySeconds: 0.2,
      attackCurve: 0.25,
      decayCurve: -0.6,
      releaseCurve: 0.4,
    }
    patch.modEnvelope = {
      ...patch.modEnvelope,
      delaySeconds: 0.1,
      attackCurve: -0.2,
      decayCurve: 0.3,
      releaseCurve: -0.4,
    }
    patch.oscillators[0].pan = 0.1
    patch.oscillators[1].pan = 0.5
    patch.oscillators[2].pan = 0.9
    patch.filter = { ...patch.filter, slope: 24, drive: 0.65, keytrack: 0.75 }
    patch.lfo1.smoothing = 0.4
    patch.voice.transposeSemitones = -7
    patch.effects.distortion = { enabled: true, type: 'sine_fold', drive: 0.7, mix: 0.6 }
    patch.effects.chorus = {
      enabled: true,
      voices: 3,
      rate: 0.35,
      depth: 0.8,
      feedback: 0.2,
      mix: 0.45,
    }
    patch.effects.compressor = {
      enabled: true,
      bands: 'low',
      amount: 0.65,
      attack: 0.3,
      release: 0.7,
      mix: 0.8,
    }
    patch.effects.reverb = {
      ...patch.effects.reverb,
      predelay: 0.12,
      lowCut: 0.2,
      highCut: 0.85,
    }

    const imported = adapter.importPatch(adapter.exportPatch(patch).document).patch
    expect(imported.ampEnvelope).toMatchObject({
      delaySeconds: expect.closeTo(0.2),
      attackCurve: 0.25,
      decayCurve: -0.6,
      releaseCurve: 0.4,
    })
    expect(imported.modEnvelope).toMatchObject({
      delaySeconds: expect.closeTo(0.1),
      attackCurve: -0.2,
      decayCurve: 0.3,
      releaseCurve: -0.4,
    })
    expect(imported.oscillators.map(({ pan }) => pan)).toEqual([
      expect.closeTo(0.1),
      0.5,
      0.9,
    ])
    expect(imported.filter).toMatchObject({ slope: 24, drive: 0.65, keytrack: 0.75 })
    expect(imported.lfo1.smoothing).toBeCloseTo(0.4)
    expect(imported.voice.transposeSemitones).toBe(-7)
    expect(imported.effects.distortion).toEqual(patch.effects.distortion)
    expect(imported.effects.chorus).toEqual(patch.effects.chorus)
    expect(imported.effects.compressor).toEqual(patch.effects.compressor)
    expect(imported.effects.reverb).toMatchObject({ predelay: 0.12, lowCut: 0.2, highCut: 0.85 })
  })

  it('round-trips oscillator 3 scalars and wavetable slot with fixed global modulation', () => {
    const adapter = realAdapter()
    const before = createDefaultPatch()
    const patch = structuredClone(before)
    patch.oscillators[2] = {
      enabled: true,
      wavetableId: 'sine',
      wavetablePosition: 0.25,
      level: 0.49,
      transposeSemitones: -12,
      fineTuneCents: 25,
      unisonVoices: 3,
      unisonDetune: 0.36,
      stereoSpread: 0.72,
      randomPhase: 0.18,
      pan: 0.5,
    }
    const exported = adapter.exportPatch(patch)
    const routes = exported.document.settings.modulations as Array<Record<string, unknown>>
    expect(exported.document.settings.wavetables).toHaveLength(3)
    expect(exported.document.settings).toMatchObject({
      osc_3_on: 1,
      osc_3_destination: 3,
      osc_3_level: Math.sqrt(0.49 * 0.5),
      osc_3_wave_frame: 64,
      osc_3_transpose: -12,
      osc_3_tune: 0.25,
      osc_3_unison_voices: 3,
      osc_3_unison_detune: Math.sqrt(0.36 * 12),
      osc_3_stereo_spread: 0.72,
      osc_3_random_phase: 0.18,
      modulation_1_amount: -0.68,
      modulation_1_bipolar: 0,
    })
    expect(routes.slice(0, 3)).toEqual([
      { source: 'lfo_1', destination: 'osc_1_level' },
      { source: 'lfo_1', destination: 'osc_2_level' },
      { source: 'lfo_1', destination: 'osc_3_level' },
    ])

    expect(adapter.controlOperations(before, patch).map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'osc_3_on',
        'osc_3_level',
        'osc_3_wave_frame',
        'osc_3_transpose',
        'osc_3_tune',
        'osc_3_unison_voices',
        'osc_3_unison_detune',
        'osc_3_stereo_spread',
        'osc_3_random_phase',
      ]),
    )

    const imported = adapter.importPatch(exported.document).patch
    expect(imported.oscillators[2]).toMatchObject({
      ...patch.oscillators[2],
      level: expect.any(Number),
      unisonDetune: expect.any(Number),
    })
    expect(imported.oscillators[2].level).toBeCloseTo(patch.oscillators[2].level)
    expect(imported.oscillators[2].unisonDetune).toBeCloseTo(
      patch.oscillators[2].unisonDetune,
    )
    expect(imported.modulations.map(({ destination }) => destination)).toEqual([
      'oscillator1.level',
      'oscillator2.level',
      'oscillator3.level',
      'oscillator1.wavetablePosition',
      'oscillator2.wavetablePosition',
      'oscillator3.wavetablePosition',
    ])
    expect(imported.effects.order).toEqual(patch.effects.order)
  })

  it('lossily normalizes unsupported FX-filter and effect-order values with warnings', () => {
    const adapter = realAdapter()
    const document = structuredClone(adapter.exportPatch(createDefaultPatch()).document)
    document.settings.filter_fx_model = 3
    document.settings.effect_chain_order = -1

    const imported = adapter.importPatch(document)
    expect(imported.patch.filter.type).toBe('lowpass')
    expect(imported.patch.effects.order).toHaveLength(6)
    expect(imported.patch.metadata.tags).toContain('vital-lossy')
    expect(imported.warnings).toEqual(
      expect.arrayContaining([
        'The original filter model was mapped to the workbench low-pass filter.',
        'The effect-chain order encoding was rounded into Vital’s supported range.',
      ]),
    )
  })
})
