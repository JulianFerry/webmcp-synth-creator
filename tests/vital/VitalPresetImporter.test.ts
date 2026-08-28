import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import type { PatchState } from '../../src/patch/types'
import { getPresetPatch, listPresets } from '../../src/presets/registry'
import { VitalPresetAdapter, type VitalPresetDocument } from '../../src/vital/VitalPresetAdapter'
import { VitalImportError } from '../../src/vital/VitalPresetImporter'

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

  it('rejects unsupported versions, routing, modulation sources, and template material', () => {
    const adapter = realAdapter()
    const exported = adapter.exportPatch(createDefaultPatch()).document

    const wrongVersion = cloneDocument(exported)
    wrongVersion.synth_version = '1.5.5'
    expect(() => adapter.importPatch(wrongVersion)).toThrow(/Unsupported Vital version/)

    const wrongRouting = cloneDocument(exported)
    wrongRouting.settings.osc_1_destination = 1
    expect(() => adapter.importPatch(wrongRouting)).toThrow(/route only through Filter 1/)

    const filterTwo = cloneDocument(exported)
    filterTwo.settings.filter_2_on = 1
    expect(() => adapter.importPatch(filterTwo)).toThrow(/Filter 2 must be off/)

    const unsupportedRoute = cloneDocument(exported)
    ;(unsupportedRoute.settings.modulations as Array<Record<string, unknown>>)[0].source = 'lfo_2'
    expect(() => adapter.importPatch(unsupportedRoute)).toThrow(/Unsupported Vital modulation route/)

    const unsupportedDestination = cloneDocument(exported)
    ;(
      unsupportedDestination.settings.modulations as Array<Record<string, unknown>>
    )[0].destination = 'filter_2_cutoff'
    expect(() => adapter.importPatch(unsupportedDestination)).toThrow(
      /Unsupported Vital modulation route/,
    )

    const sampleMaterial = cloneDocument(exported)
    const sample = sampleMaterial.settings.sample as Record<string, unknown>
    sample.name = 'Unsupported sample'
    expect(() => adapter.importPatch(sampleMaterial)).toThrow(/Unsupported Vital setting changed: sample/)
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
    expect(() => adapter.importPatch(unsupportedPhase)).toThrow(VitalImportError)
  })

  it('refuses to export filter models that the pinned importer cannot represent truthfully', () => {
    const patch = createDefaultPatch()
    patch.filter.type = 'highpass'
    expect(() => realAdapter().exportPatch(patch)).toThrow(/supports only.*lowpass/i)
  })
})
