import { describe, expect, it } from 'vitest'

import { parsePatchState } from '../../src/patch/schemas'
import {
  findMatchingPresetId,
  getPresetPatch,
  listPresets,
} from '../../src/presets/registry'
import {
  GENERATED_WAVETABLE_IDS,
  resolveWavetable,
  WAVETABLE_REGISTRY,
} from '../../src/wavetables/registry'
import { renderWavetableFrame } from '../../src/wavetables/render'

describe('curated preset and generated wavetable registries', () => {
  it('exposes six musical starts and eight calibration stages backed by generated tables', () => {
    const presets = listPresets()
    expect(presets.map(({ id }) => id)).toEqual([
      'ethereal-gate',
      'midnight-pad',
      'warm-mono-bass',
      'glass-pluck',
      'wide-lead',
      'rhythmic-pulse',
      'calibration-a-osc1-sine',
      'calibration-b-custom-wavetable',
      'calibration-c-amp-envelope',
      'calibration-d-unison',
      'calibration-e-filter',
      'calibration-f-lfo-gate',
      'calibration-g-osc2',
      'calibration-h-delay-reverb',
    ])
    expect(new Set(presets.map(({ id }) => id)).size).toBe(14)

    for (const preset of presets) {
      const patch = parsePatchState(getPresetPatch(preset.id))
      expect(patch.metadata.name).toBe(preset.name)
      expect(patch.metadata.category).toBe(preset.category)
      for (const oscillator of patch.oscillators) {
        expect(WAVETABLE_REGISTRY[oscillator.wavetableId]).toBeDefined()
        expect(resolveWavetable(patch.wavetableData, oscillator.wavetableId)).toBeDefined()
      }

      const routeIds = patch.modulations.map(({ id }) => id)
      const routePairs = patch.modulations.map(({ source, destination }) => `${source}:${destination}`)
      expect(patch.modulations).toEqual([
        {
          id: 'workbench-lfo-oscillator-1-level',
          source: 'lfo1',
          destination: 'oscillator1.level',
          amount: -0.68,
          bipolar: false,
        },
        {
          id: 'workbench-lfo-oscillator-2-level',
          source: 'lfo1',
          destination: 'oscillator2.level',
          amount: -0.68,
          bipolar: false,
        },
        {
          id: 'workbench-lfo-oscillator-3-level',
          source: 'lfo1',
          destination: 'oscillator3.level',
          amount: -0.68,
          bipolar: false,
        },
      ])
      expect(new Set(routeIds).size).toBe(routeIds.length)
      expect(new Set(routePairs).size).toBe(routePairs.length)
    }
  })

  it('returns cloned preset state rather than shared registry objects', () => {
    const first = getPresetPatch('glass-pluck')
    first.metadata.name = 'Mutated caller copy'
    first.wavetableData.glass.frames[0].harmonics[0] = 0

    const second = getPresetPatch('glass-pluck')
    expect(second.metadata.name).toBe('Glass Pluck')
    expect(second.wavetableData.glass.frames[0].harmonics[0]).toBe(1)
  })

  it('identifies only exact curated state and marks edits as custom', () => {
    const patch = getPresetPatch('midnight-pad')
    expect(findMatchingPresetId(patch)).toBe('midnight-pad')

    patch.filter.cutoffHz -= 1
    expect(findMatchingPresetId(patch)).toBeNull()
  })

  it('renders every generated frame deterministically with normalized finite samples', () => {
    expect(GENERATED_WAVETABLE_IDS).toEqual([
      'sine',
      'triangle',
      'saw',
      'soft-square',
      'warm-saw',
      'hollow',
      'harsh',
      'airy',
      'glass',
      'metallic',
      'digital',
      'vocal',
    ])

    for (const wavetable of Object.values(WAVETABLE_REGISTRY)) {
      for (const frame of wavetable.frames) {
        const first = renderWavetableFrame(frame)
        const second = renderWavetableFrame(frame)
        expect([...first]).toEqual([...second])
        expect([...first].every(Number.isFinite)).toBe(true)
        const peak = Math.max(...first.map(Math.abs))
        expect(peak).toBeCloseTo(1, 5)
      }
    }
  })
})
