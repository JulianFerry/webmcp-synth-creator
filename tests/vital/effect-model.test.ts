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
    expect(VITAL_FX_FILTER_TYPES).toEqual({
      lowpass: { model: 0, style: 0, blend: 0 },
      highpass: { model: 0, style: 0, blend: 2 },
      bandpass: { model: 0, style: 0, blend: 1 },
      notch: { model: 0, style: 2, blend: 1 },
    })
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
      expect(decodeVitalFxFilterType(mapping)).toBe(type)
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

  it('maps logical filter modulation to the same FX filter cutoff', () => {
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

    expect(routes[0]).toEqual({ source: 'env_2', destination: 'filter_fx_cutoff' })
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
