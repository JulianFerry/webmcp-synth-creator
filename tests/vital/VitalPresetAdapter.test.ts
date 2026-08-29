import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  mapPhaseOneVitalParameters,
  mapStructuredVitalParameters,
  setVitalValues,
  VitalExportError,
} from '../../src/vital/parameterMap'
import { VitalPresetAdapter, vitalFilename } from '../../src/vital/VitalPresetAdapter'
import { decodeVitalEnvelopeSeconds } from '../../src/vital/units'

export function createSyntheticVitalInit() {
  const patch = createDefaultPatch()
  const modulationValues = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => index + 1).flatMap((slot) =>
      ['amount', 'bipolar', 'stereo', 'power', 'bypass'].map((field) => [
        `modulation_${slot}_${field}`,
        0,
      ]),
    ),
  )
  return {
    author: '',
    comments: '',
    preset_name: 'Init Preset',
    preset_style: 'Init',
    synth_version: 'phase-1-test-version',
    settings: {
      ...Object.fromEntries(
        Object.keys({
          ...mapPhaseOneVitalParameters(patch),
          ...mapStructuredVitalParameters(patch),
        }).map((key) => [key, 0]),
      ),
      ...modulationValues,
      untouched_fixture_value: 99,
      wavetables: [{ original: 1 }, { original: 2 }, { original: 3 }],
      lfos: [{ original: 'lfo-1' }],
      modulations: Array.from({ length: 16 }, () => ({ source: '', destination: '' })),
    },
  }
}

describe('VitalPresetAdapter', () => {
  it('rejects any mapped key that the Init fixture does not prove', () => {
    expect(() => setVitalValues({ known: 0 }, { unknown: 1 })).toThrowError(
      new VitalExportError('Unknown Vital settings: unknown'),
    )
  })

  it('maps metadata, logical parameters, and three generated wavetables without replacing the template', () => {
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
      osc_1_level: Math.sqrt(0.62 * 0.5),
      osc_1_unison_detune: Math.sqrt(patch.oscillators[0].unisonDetune * 12),
      osc_1_wave_frame: 0.62 * 256,
      osc_1_destination: 0,
      osc_2_destination: 0,
      osc_3_destination: 0,
      untouched_fixture_value: 99,
    })
    expect(
      decodeVitalEnvelopeSeconds(exported.document.settings.env_1_attack as number),
    ).toBeCloseTo(0.18)

    const wavetables = exported.document.settings.wavetables as Array<Record<string, unknown>>
    expect(wavetables[0]).toMatchObject({ name: 'Generated Air Spectrum' })
    expect(wavetables[1]).toMatchObject({ name: 'Generated Sine' })
    expect(wavetables[2]).toMatchObject({ name: 'Generated Air Spectrum' })
  })

  it('keeps export filenames safe and deterministic', () => {
    expect(vitalFilename('  Æther / Pad 01  ')).toBe('ther-pad-01.vital')
    expect(vitalFilename('***')).toBe('wavetable-workbench-patch.vital')
  })

  it('requires versioned fixture metadata and three oscillator slots', () => {
    expect(() =>
      new VitalPresetAdapter({
        synth_version: '',
        settings: { wavetables: [{}, {}], lfos: [{}], modulations: [{}] },
      }),
    ).toThrow(/pinned synth_version/)
    expect(() =>
      new VitalPresetAdapter({
        synth_version: '1',
        settings: { wavetables: [{}], lfos: [{}], modulations: [{}] },
      }),
    ).toThrow(/at least three wavetable slots/)
  })
})
