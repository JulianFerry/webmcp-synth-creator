import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getPresetPatch, listPresets } from '../../src/presets/registry'
import { listTemplatePatches } from '../../src/presets/templates'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { VITAL_MODULATION_DESTINATIONS, VITAL_MODULATION_SOURCES } from '../../src/vital/modulations'
import { VITAL_FRAME_SAMPLE_COUNT } from '../../src/wavetables/render'

function realAdapter(): VitalPresetAdapter {
  return new VitalPresetAdapter(
    JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')),
  )
}

describe('curated preset Vital structure', () => {
  it.each(listTemplatePatches().map(({ category, patch }) => [category, patch] as const))(
    'strictly round-trips the validated %s template',
    (_category, patch) => {
      const adapter = realAdapter()
      const exported = adapter.exportPatch(patch)
      const imported = adapter.importPatchStrict(exported.document)
      expect(adapter.exportPatch(imported.patch).document.settings).toEqual(exported.document.settings)
    },
  )

  it.each(listPresets().map(({ id }) => [id] as const))(
    'exports %s with matching tables, envelopes, LFO, routes, and effects',
    (presetId) => {
      const patch = getPresetPatch(presetId)
      const settings = realAdapter().exportPatch(patch).document.settings
      expect(settings.filter_fx_keytrack).toBe(0)
      const wavetables = settings.wavetables as Array<{
        groups: Array<{ components: Array<{ keyframes: Array<{ wave_data: string }> }> }>
      }>

      patch.oscillators.forEach((oscillator, index) => {
        const logicalTable = patch.wavetableData[oscillator.wavetableId]
        const keyframes = wavetables[index].groups[0].components[0].keyframes
        expect(keyframes).toHaveLength(logicalTable.frames.length)
        for (const keyframe of keyframes) {
          expect(Buffer.from(keyframe.wave_data, 'base64')).toHaveLength(
            VITAL_FRAME_SAMPLE_COUNT * Float32Array.BYTES_PER_ELEMENT,
          )
        }
      })

      expect(settings).toMatchObject({
        osc_1_level: Math.sqrt(patch.oscillators[0].level * 0.5),
        osc_2_level: Math.sqrt(patch.oscillators[1].level * 0.5),
        osc_3_level: Math.sqrt(patch.oscillators[2].level * 0.5),
        osc_1_unison_detune: Math.sqrt(patch.oscillators[0].unisonDetune * 12),
        osc_2_unison_detune: Math.sqrt(patch.oscillators[1].unisonDetune * 12),
        osc_3_unison_detune: Math.sqrt(patch.oscillators[2].unisonDetune * 12),
        env_1_sustain: patch.ampEnvelope.sustainLevel,
        env_2_sustain: patch.modEnvelope.sustainLevel,
        delay_on: Number(patch.effects.delay.enabled),
        reverb_on: Number(patch.effects.reverb.enabled),
      })

      const lfo = (settings.lfos as Array<Record<string, unknown>>)[0]
      expect(lfo).toMatchObject({
        num_points: patch.lfo1.points.length,
        smooth: patch.lfo1.smooth,
      })
      expect(lfo.points).toHaveLength(patch.lfo1.points.length * 2)
      expect(lfo.powers).toHaveLength(patch.lfo1.points.length)

      const routes = settings.modulations as Array<{ source: string; destination: string }>
      patch.modulations.forEach((route, index) => {
        expect(routes[index]).toEqual({
          source: VITAL_MODULATION_SOURCES[route.source],
          destination: VITAL_MODULATION_DESTINATIONS[route.destination],
        })
        expect(settings[`modulation_${index + 1}_amount`]).toBe(route.amount)
      })
      expect(routes.slice(patch.modulations.length).every((route) => route.source === '')).toBe(
        true,
      )
    },
  )

  it.each(listPresets().map(({ id }) => [id] as const))(
    'strictly round-trips curated preset %s',
    (presetId) => {
      const adapter = realAdapter()
      const exported = adapter.exportPatch(getPresetPatch(presetId))
      const imported = adapter.importPatchStrict(exported.document)
      expect(imported.patch.version).toBe(4)
    },
  )
})
