import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  mapPhaseOneVitalParameters,
  setVitalValues,
  VitalExportError,
} from '../../src/vital/parameterMap'
import { VitalPresetAdapter, vitalFilename } from '../../src/vital/VitalPresetAdapter'

export function createSyntheticVitalInit() {
  const patch = createDefaultPatch()
  return {
    author: '',
    comments: '',
    preset_name: 'Init Preset',
    preset_style: 'Init',
    synth_version: 'phase-1-test-version',
    settings: {
      ...Object.fromEntries(
        Object.keys(mapPhaseOneVitalParameters(patch)).map((key) => [key, 0]),
      ),
      untouched_fixture_value: 99,
      wavetables: [{ original: 1 }, { original: 2 }, { original: 3 }],
    },
  }
}

describe('VitalPresetAdapter', () => {
  it('rejects any mapped key that the Init fixture does not prove', () => {
    expect(() => setVitalValues({ known: 0 }, { unknown: 1 })).toThrowError(
      new VitalExportError('Unknown Vital settings: unknown'),
    )
  })

  it('maps metadata, logical parameters, and two generated wavetables without replacing the template', () => {
    const adapter = new VitalPresetAdapter(createSyntheticVitalInit())
    const patch = createDefaultPatch()
    patch.metadata.name = 'Air / Night'
    patch.filter.cutoffHz = 440
    const exported = adapter.exportPatch(patch)

    expect(exported.filename).toBe('air-night.vital')
    expect(exported.document).toMatchObject({
      author: 'Wavetable Workbench',
      preset_name: 'Air / Night',
      preset_style: 'Pad',
      synth_version: 'phase-1-test-version',
    })
    expect(exported.document.settings).toMatchObject({
      filter_1_cutoff: 69,
      osc_1_level: 0.62,
      osc_1_wave_frame: 0.62 * 256,
      env_1_attack: 0.18,
      untouched_fixture_value: 99,
    })

    const wavetables = exported.document.settings.wavetables as Array<Record<string, unknown>>
    expect(wavetables[0]).toMatchObject({ name: 'Generated Air Spectrum' })
    expect(wavetables[1]).toMatchObject({ name: 'Generated Sine' })
    expect(wavetables[2]).toEqual({ original: 3 })
  })

  it('keeps export filenames safe and deterministic', () => {
    expect(vitalFilename('  Æther / Pad 01  ')).toBe('ther-pad-01.vital')
    expect(vitalFilename('***')).toBe('wavetable-workbench-patch.vital')
  })

  it('requires versioned fixture metadata and two oscillator slots', () => {
    expect(() =>
      new VitalPresetAdapter({ synth_version: '', settings: { wavetables: [{}, {}] } }),
    ).toThrow(/pinned synth_version/)
    expect(() =>
      new VitalPresetAdapter({ synth_version: '1', settings: { wavetables: [{}] } }),
    ).toThrow(/at least two wavetable slots/)
  })
})
