import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import type { PatchState } from '../../src/patch/types'
import { getPresetPatch, listPresets } from '../../src/presets/registry'
import { VitalPresetAdapter, type VitalPresetDocument } from '../../src/vital/VitalPresetAdapter'

function realAdapter(): VitalPresetAdapter {
  return new VitalPresetAdapter(
    JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')),
  )
}

function cloneDocument(document: VitalPresetDocument): VitalPresetDocument {
  return structuredClone(document)
}

function expectTreeClose(actual: unknown, expected: unknown): void {
  if (typeof actual === 'number' && typeof expected === 'number') {
    expect(actual).toBeCloseTo(expected, 8)
    return
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    expect(actual).toHaveLength(expected.length)
    actual.forEach((value, index) => expectTreeClose(value, expected[index]))
    return
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    expect(Object.keys(actual)).toEqual(Object.keys(expected))
    for (const key of Object.keys(expected)) {
      expectTreeClose(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
      )
    }
    return
  }
  expect(actual).toEqual(expected)
}

function expectSupportedRoundTrip(source: PatchState, imported: PatchState): void {
  const expected = structuredClone(source)
  expected.metadata.tags = ['vital-import']
  expected.modulations.forEach((route, index) => {
    route.id = imported.modulations[index].id
  })
  expected.lfo1.points.forEach((point) => {
    point.power ??= 0
  })
  expectTreeClose(imported, expected)
}

describe('VitalPresetAdapter import', () => {
  it.each(listPresets().map(({ id }) => [id]))(
    'round-trips every supported logical mapping for curated preset %s',
    (presetId) => {
      const adapter = realAdapter()
      const source = getPresetPatch(presetId)
      const exported = adapter.exportPatch(source)
      const imported = adapter.importPatch(exported.document)

      expectSupportedRoundTrip(source, imported.patch)
      expect(imported.sourceVersion).toBe('1.0.7')
      expect(imported.backing.hiddenEffects).toEqual([])
      expect(imported.backing.affectedControls).toEqual([])
      expect(imported.warnings).toEqual([
        expect.stringContaining('tags or modulation route IDs'),
      ])
    },
  )

  it('recovers representable custom frames and rounds cutoff to a PatchState whole number', () => {
    const adapter = realAdapter()
    const source = createDefaultPatch()
    source.metadata.name = 'Custom Harmonic Import'
    source.filter.cutoffHz = 7777
    source.oscillators[0].wavetableId = 'custom-spectrum'
    source.oscillators[1].wavetableId = 'custom-spectrum'
    source.oscillators[2].wavetableId = 'custom-spectrum'
    source.wavetableData = {
      'custom-spectrum': {
        id: 'custom-spectrum',
        name: 'Custom Spectrum',
        frames: [
          { harmonics: [1, 0.5, 0.125, 0, 0.0625, 1e-8] },
          { harmonics: [1, 0.2, 0.45, 0.08, 0.025, 1e-8] },
        ],
      },
    }

    const imported = adapter.importPatch(adapter.exportPatch(source).document).patch
    expect(imported.filter.cutoffHz).toBe(7777)
    expect(imported.oscillators.map(({ wavetableId }) => wavetableId)).toEqual([
      'vital-osc-1-custom-spectrum',
      'vital-osc-2-custom-spectrum',
      'vital-osc-3-custom-spectrum',
    ])
    for (const wavetable of Object.values(imported.wavetableData)) {
      expect(wavetable.frames).toHaveLength(2)
      wavetable.frames.forEach((frame, frameIndex) => {
        expect(frame.harmonics).toHaveLength(source.wavetableData['custom-spectrum'].frames[frameIndex].harmonics.length)
        frame.harmonics.forEach((harmonic, harmonicIndex) => {
          expect(harmonic).toBeCloseTo(
            source.wavetableData['custom-spectrum'].frames[frameIndex].harmonics[harmonicIndex],
            4,
          )
        })
      })
    }
  })

  it('imports unsupported versions and features through the same lossy path', () => {
    const adapter = realAdapter()
    const exported = adapter.exportPatch(createDefaultPatch()).document

    const wrongVersion = cloneDocument(exported)
    wrongVersion.synth_version = '1.5.5'
    const versionImport = adapter.importPatch(wrongVersion)
    expect(versionImport.sourceVersion).toBe('1.5.5')
    expect(versionImport.patch.metadata.tags).toContain('vital-lossy')
    expect(versionImport.warnings).toEqual([
      expect.stringContaining('exact compatibility path rejected'),
      expect.stringContaining('1.5.5'),
    ])

    const wrongRouting = cloneDocument(exported)
    wrongRouting.settings.osc_1_destination = 1
    expect(adapter.importPatch(wrongRouting).warnings).toContain(
      'Oscillator routing outside the effects input was collapsed into the workbench signal path.',
    )

    const filterTwo = cloneDocument(exported)
    filterTwo.settings.filter_2_on = 1
    expect(adapter.importPatch(filterTwo).warnings).toContain('Filter 2 was omitted.')

    const unsupportedRoute = cloneDocument(exported)
    ;(unsupportedRoute.settings.modulations as Array<Record<string, unknown>>)[0].source = 'lfo_2'
    expect(adapter.importPatch(unsupportedRoute).warnings).toContain(
      '1 unsupported modulation route(s) were omitted.',
    )

    const unsupportedDestination = cloneDocument(exported)
    ;(
      unsupportedDestination.settings.modulations as Array<Record<string, unknown>>
    )[0].destination = 'filter_2_cutoff'
    expect(adapter.importPatch(unsupportedDestination).warnings).toContain(
      '1 unsupported modulation route(s) were omitted.',
    )

    const sampleMaterial = cloneDocument(exported)
    const sample = sampleMaterial.settings.sample as Record<string, unknown>
    sample.name = 'Unsupported sample'
    expect(adapter.importPatch(sampleMaterial).patch.metadata.tags).toContain('vital-lossy')
  })

  it('imports legacy metadata, audio-file wavetables, and out-of-range controls with warnings', () => {
    const adapter = realAdapter()
    const legacy = cloneDocument(adapter.exportPatch(createDefaultPatch()).document)
    const pcm = Buffer.alloc(2048 * 2)
    for (let index = 0; index < 2048; index += 1) {
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * index) / 2048) * 32767), index * 2)
    }

    delete legacy.preset_name
    legacy.synth_version = '0.9.0'
    legacy.preset_style = 'Percussion'
    legacy.settings.osc_1_transpose = -27
    legacy.settings.osc_2_transpose = 7
    legacy.settings.osc_3_transpose = 13
    legacy.settings.osc_1_level = 0
    legacy.settings.osc_3_on = 1
    legacy.settings.sample_on = 1
    legacy.settings.distortion_on = 1
    legacy.settings.compressor_on = 1
    legacy.settings.lfo_1_sync_type = 2
    ;(legacy.settings.lfos as Array<Record<string, unknown>>)[0].powers = [8, 0, 0]
    ;(legacy.settings.wavetables as Array<Record<string, unknown>>)[0] = {
      name: 'Legacy Audio Table',
      groups: [
        {
          components: [
            {
              type: 'Audio File Source',
              audio_file: pcm.toString('base64'),
              keyframes: [{ position: 0, start_position: 0, window_size: 2048 }],
            },
            { type: 'Wave Folder', keyframes: [{ position: 0, fold_boost: 2 }] },
          ],
        },
      ],
    }
    const modulations = legacy.settings.modulations as Array<Record<string, unknown>>
    modulations[0] = { source: 'lfo_1', destination: 'osc_1_transpose' }
    legacy.settings.modulation_1_amount = 0.63
    modulations[1] = { source: 'lfo_2', destination: 'osc_1_level' }
    legacy.settings.modulation_2_amount = 1

    const imported = adapter.importPatch(legacy, { sourceFilename: 'Kick Drum 1.vital' })
    expect(imported.sourceVersion).toBe('0.9.0')
    expect(imported.patch.metadata).toMatchObject({
      name: 'Kick Drum 1',
      category: 'other',
      tags: ['vital-import', 'vital-lossy'],
    })
    expect(imported.patch.oscillators[0]).toMatchObject({
      level: 1,
      transposeSemitones: -24,
    })
    expect(imported.patch.oscillators.map(({ transposeSemitones }) => transposeSemitones)).toEqual([
      -24,
      7,
      13,
    ])
    expect(imported.patch.wavetableData['vital-osc-1-legacy-audio-table'].frames).toHaveLength(1)
    expect(imported.patch.modulations.map(({ destination }) => destination)).toEqual([
      'oscillator1.level',
      'oscillator2.level',
      'oscillator3.level',
    ])
    expect(imported.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('source filename'),
        expect.stringContaining('Audio File Source'),
        expect.stringContaining('sample layer'),
        expect.stringContaining('distortion, compressor'),
      ]),
    )
  })

  it('rejects malformed required structure and invalid encoded frame data', () => {
    const adapter = realAdapter()
    expect(() => adapter.importPatch({ synth_version: '1.0.7' })).toThrow(
      /top-level structure/,
    )

    const exported = adapter.exportPatch(createDefaultPatch()).document
    const invalidFrame = cloneDocument(exported)
    const wavetable = (invalidFrame.settings.wavetables as Array<Record<string, unknown>>)[0]
    const group = (wavetable.groups as Array<Record<string, unknown>>)[0]
    const component = (group.components as Array<Record<string, unknown>>)[0]
    const keyframe = (component.keyframes as Array<Record<string, unknown>>)[0]
    keyframe.wave_data = 'not-base64'
    expect(() => adapter.importPatch(invalidFrame)).toThrow(/not valid base64/)

    const unsupportedPhase = cloneDocument(exported)
    const phaseWavetable = (unsupportedPhase.settings.wavetables as Array<Record<string, unknown>>)[0]
    const phaseGroup = (phaseWavetable.groups as Array<Record<string, unknown>>)[0]
    const phaseComponent = (phaseGroup.components as Array<Record<string, unknown>>)[0]
    const phaseKeyframe = (phaseComponent.keyframes as Array<Record<string, unknown>>)[0]
    const encoded = phaseKeyframe.wave_data as string
    phaseKeyframe.wave_data = `${encoded.slice(0, 12)}AAAA${encoded.slice(16)}`
    const phaseImport = adapter.importPatch(unsupportedPhase)
    expect(phaseImport.patch.metadata.tags).toContain('vital-lossy')
    expect(phaseImport.warnings[0]).toContain('exact compatibility path rejected')
  })

  it('lossily migrates the previous Filter 1 export shape into the effects-chain filter', () => {
    const adapter = realAdapter()
    const legacy = cloneDocument(adapter.exportPatch(createDefaultPatch()).document)
    legacy.settings.filter_fx_on = 0
    legacy.settings.filter_1_on = 1
    legacy.settings.filter_1_cutoff = 72
    legacy.settings.filter_1_resonance = 0.61
    legacy.settings.osc_1_destination = 0
    legacy.settings.osc_2_destination = 0
    legacy.settings.osc_3_destination = 0
    ;(legacy.settings.modulations as Array<Record<string, unknown>>)[1].destination =
      'filter_1_cutoff'

    const imported = adapter.importPatch(legacy)
    expect(imported.patch.filter).toMatchObject({
      enabled: true,
      type: 'lowpass',
      cutoffHz: 523,
      resonance: 0.61,
    })
    expect(imported.patch.modulations.map(({ destination }) => destination)).toEqual([
      'oscillator1.level',
      'oscillator2.level',
      'oscillator3.level',
    ])
    expect(imported.warnings).toContain(
      'Legacy Filter 1 was moved into the workbench effects-chain filter.',
    )
  })
})
