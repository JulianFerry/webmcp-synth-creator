import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { vitalEnginePayload } from '../../src/audio/vital/state'
import { createDefaultPatch } from '../../src/patch/defaults'
import { decodeFloatToOrder, encodeOrderToFloat } from '../../src/vital/effectOrder'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared Vital state', () => {
  it('uses the exact deterministic export body for engine loading and download', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as unknown
    const adapter = new VitalPresetAdapter(fixture)
    const patch = createDefaultPatch()
    const exported = adapter.exportPatch(patch)
    let downloadedBlob: Blob | undefined
    const anchor = { click: vi.fn(), download: '', href: '' }
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('document', { createElement: () => anchor })
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        downloadedBlob = blob
        return 'blob:vital-state'
      },
      revokeObjectURL,
    })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      },
    })

    const downloadedFilename = adapter.downloadPatch(patch)

    expect(adapter.exportPatch(patch).json).toBe(exported.json)
    expect(vitalEnginePayload(adapter, patch)).toBe(exported.json)
    expect(await downloadedBlob?.text()).toBe(exported.json)
    expect(downloadedFilename).toBe(exported.filename)
    expect(anchor.download).toBe(exported.filename)
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:vital-state')
  })

  it('loads and exports untouched native imports byte-for-byte while preserving unsupported state after edits', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as unknown
    const adapter = new VitalPresetAdapter(fixture)
    const nativeDocument = adapter.exportPatch(createDefaultPatch()).document
    nativeDocument.author = 'Native preset author'
    nativeDocument.preset_name = 'Preserved Native State'
    nativeDocument.settings.osc_1_destination = 1
    nativeDocument.settings.sample_on = 1
    nativeDocument.settings.compressor_on = 1
    nativeDocument.settings.eq_on = 1
    ;(nativeDocument.settings.sample as Record<string, unknown>).name = 'Preserved sample layer'
    const routes = nativeDocument.settings.modulations as Array<Record<string, unknown>>
    routes[5] = { source: 'lfo_2', destination: 'sample_transpose' }
    nativeDocument.settings.modulation_6_amount = 0.37
    routes[3] = { source: 'macro_control_2', destination: 'filter_fx_cutoff' }
    nativeDocument.settings.modulation_4_amount = 0.42
    nativeDocument.settings.macro_control_2 = 0.8
    nativeDocument.settings.effect_chain_order = encodeOrderToFloat([4, 0, 6, 1, 2, 3, 5, 7, 8])
    const lfos = nativeDocument.settings.lfos as Array<Record<string, unknown>>
    lfos[1] = { ...lfos[1], name: 'Preserved LFO 2' }
    const originalJson = `\n${JSON.stringify(nativeDocument, null, 2)}\n`

    const imported = adapter.importPatch(nativeDocument, {
      originalJson,
      sourceFilename: 'preserved-native-state.vital',
    })
    expect(imported.backing.preservesUnsupportedFeatures).toBe(true)
    expect(imported.backing.hiddenEffects).toEqual(['Equalizer'])
    expect(imported.backing.affectedControls).toEqual([
      { control: 'filter cutoff', sources: ['Macro 2'] },
    ])
    expect(vitalEnginePayload(adapter, imported.patch, imported.backing)).toBe(originalJson)
    expect(adapter.exportPatch(imported.patch, imported.backing).json).toBe(originalJson)

    const edited = structuredClone(imported.patch)
    edited.filter.cutoffHz = 2_400
    edited.metadata.name = 'Edited Preserved Native State'
    edited.lfo1.points[1].x += 0.01
    edited.effects.order = [...edited.effects.order].reverse()
    const retained = adapter.exportPatch(edited, imported.backing)

    expect(retained.document).toMatchObject({
      author: 'Native preset author',
      preset_name: 'Edited Preserved Native State',
      settings: {
        osc_1_destination: 1,
        sample_on: 1,
        modulation_6_amount: 0.37,
      },
    })
    expect((retained.document.settings.sample as Record<string, unknown>).name).toBe(
      'Preserved sample layer',
    )
    expect((retained.document.settings.modulations as unknown[])[5]).toEqual({
      source: 'lfo_2',
      destination: 'sample_transpose',
    })
    expect(
      (retained.document.settings.modulations as Array<Record<string, unknown>>)
        .filter(({ source }) => source === 'lfo_1')
        .map(({ destination }) => destination),
    ).toEqual(
      expect.arrayContaining(['osc_1_level', 'osc_2_level', 'osc_3_level']),
    )
    expect((retained.document.settings.lfos as Array<Record<string, unknown>>)[1].name).toBe(
      'Preserved LFO 2',
    )
    const retainedOrder = decodeFloatToOrder(
      retained.document.settings.effect_chain_order as number,
      9,
    )
    expect([retainedOrder[0], retainedOrder[2], retainedOrder[7]]).toEqual([4, 6, 7])
  })
})
