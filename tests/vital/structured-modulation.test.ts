import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import type { LfoRate } from '../../src/patch/types'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import {
  decodeVitalLfoPointValue,
  mapVitalLfoRate,
} from '../../src/vital/lfo'
import {
  decodeVitalDelaySeconds,
  decodeVitalEnvelopeSeconds,
  decodeVitalLfoSmoothing,
  decodeVitalReverbDecaySeconds,
} from '../../src/vital/units'

function realAdapter(): VitalPresetAdapter {
  return new VitalPresetAdapter(
    JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')),
  )
}

describe('structured Vital modulation export', () => {
  it('serializes LFO points, powers, rate, phase, and smoothing from logical state', () => {
    const patch = createDefaultPatch()
    patch.lfo1 = {
      ...patch.lfo1,
      enabled: true,
      points: [
        { x: 0, y: 0, power: -0.3 },
        { x: 0.15, y: 1, power: 0.4 },
        { x: 0.31, y: 0 },
        { x: 1, y: 0.2 },
      ],
      rate: { mode: 'sync', division: '1/8T' },
      phase: 0.125,
      smooth: true,
      smoothing: decodeVitalLfoSmoothing(-5),
    }
    const exported = realAdapter().exportPatch(patch)
    const lfo = (exported.document.settings.lfos as Array<Record<string, unknown>>)[0]

    expect(lfo).toEqual({
      name: 'Wavetable Workbench LFO 1',
      num_points: 4,
      points: [0, 1, 0.15, 0, 0.31, 1, 1, 0.8],
      powers: [-0.3, 0.4, 0, 0],
      smooth: true,
    })
    const encodedPoints = lfo.points as number[]
    patch.lfo1.points.forEach((point, index) => {
      expect(encodedPoints[index * 2]).toBe(point.x)
      expect(decodeVitalLfoPointValue(encodedPoints[index * 2 + 1])).toBeCloseTo(point.y)
    })
    expect(exported.document.settings).toMatchObject({
      lfo_1_sync: 3,
      lfo_1_tempo: 9,
      lfo_1_phase: 0.125,
      lfo_1_smooth_time: -5,
    })
  })

  it.each<[LfoRate, { sync: number; tempo: number; frequency?: number }]>([
    [{ mode: 'sync', division: '1/1' }, { sync: 1, tempo: 6 }],
    [{ mode: 'sync', division: '1/2' }, { sync: 1, tempo: 7 }],
    [{ mode: 'sync', division: '1/4' }, { sync: 1, tempo: 8 }],
    [{ mode: 'sync', division: '1/8' }, { sync: 1, tempo: 9 }],
    [{ mode: 'sync', division: '1/8T' }, { sync: 3, tempo: 9 }],
    [{ mode: 'sync', division: '1/16' }, { sync: 1, tempo: 10 }],
    [{ mode: 'sync', division: '1/16T' }, { sync: 3, tempo: 10 }],
    [{ mode: 'sync', division: '1/32' }, { sync: 1, tempo: 11 }],
    [{ mode: 'sync', division: '1/64' }, { sync: 1, tempo: 12 }],
    [{ mode: 'free', hz: 2.5 }, { sync: 0, tempo: 8, frequency: Math.log2(2.5) }],
  ])('maps logical LFO rate %o to Vital timing fields', (rate, expected) => {
    expect(mapVitalLfoRate(rate)).toMatchObject(expected)
  })

  it('assigns fixed global LFO routes deterministically and clears all unused slots', () => {
    const patch = createDefaultPatch()
    patch.modulations = [
      {
        id: 'env-filter',
        source: 'modEnvelope',
        destination: 'filter.cutoff',
        amount: 0.42,
        bipolar: true,
      },
      {
        id: 'lfo-wave',
        source: 'lfo1',
        destination: 'oscillator2.wavetablePosition',
        amount: -0.2,
        bipolar: false,
      },
    ]
    const settings = realAdapter().exportPatch(patch).document.settings
    const routes = settings.modulations as Array<Record<string, unknown>>

    expect(routes.slice(0, 4)).toEqual([
      { source: 'lfo_1', destination: 'osc_1_level' },
      { source: 'lfo_1', destination: 'osc_2_level' },
      { source: 'lfo_1', destination: 'osc_3_level' },
      { source: '', destination: '' },
    ])
    expect(settings).toMatchObject({
      modulation_1_amount: -0.68,
      modulation_1_bipolar: 0,
      modulation_2_amount: -0.68,
      modulation_2_bipolar: 0,
      modulation_3_amount: -0.68,
      modulation_3_bypass: 0,
      modulation_4_amount: 0,
      modulation_4_bypass: 0,
    })
  })

  it('preserves disabled LFO routes and amounts while bypassing only those routes', () => {
    const patch = createDefaultPatch()
    patch.lfo1.enabled = false
    const settings = realAdapter().exportPatch(patch).document.settings
    const routes = settings.modulations as Array<Record<string, unknown>>

    expect(routes.slice(0, 3)).toEqual([
      { source: 'lfo_1', destination: 'osc_1_level' },
      { source: 'lfo_1', destination: 'osc_2_level' },
      { source: 'lfo_1', destination: 'osc_3_level' },
    ])
    expect(settings).toMatchObject({
      modulation_1_amount: -0.68,
      modulation_1_bypass: 1,
      modulation_2_amount: -0.68,
      modulation_2_bypass: 1,
      modulation_3_amount: -0.68,
      modulation_3_bypass: 1,
    })
    expect(patch.modulations.map(({ amount }) => amount)).toEqual([-0.68, -0.68, -0.68])
  })

  it('maps modulation envelope, synchronized delay, and reverb values', () => {
    const patch = createDefaultPatch()
    patch.modEnvelope = {
      ...patch.modEnvelope,
      attackSeconds: 0.02,
      holdSeconds: 0.1,
      decaySeconds: 0.6,
      sustainLevel: 0.2,
      releaseSeconds: 0.8,
    }
    patch.effects.delay = {
      enabled: true,
      mode: 'sync',
      division: '1/8T',
      timeSeconds: 0.23,
      feedback: 0.44,
      mix: 0.27,
    }
    patch.effects.reverb = {
      ...patch.effects.reverb,
      enabled: true,
      mix: 0.36,
      decaySeconds: 4,
      size: 0.81,
    }
    const settings = realAdapter().exportPatch(patch).document.settings

    expect(settings).toMatchObject({
      env_2_sustain: 0.2,
      delay_on: 1,
      delay_sync: 3,
      delay_tempo: 9,
      delay_feedback: 0.44,
      delay_dry_wet: 0.27,
      reverb_on: 1,
      reverb_dry_wet: 0.36,
      reverb_size: 0.81,
    })
    expect(decodeVitalEnvelopeSeconds(settings.env_2_attack as number)).toBeCloseTo(0.02)
    expect(decodeVitalEnvelopeSeconds(settings.env_2_hold as number)).toBeCloseTo(0.1)
    expect(decodeVitalEnvelopeSeconds(settings.env_2_decay as number)).toBeCloseTo(0.6)
    expect(decodeVitalEnvelopeSeconds(settings.env_2_release as number)).toBeCloseTo(0.8)
    expect(decodeVitalReverbDecaySeconds(settings.reverb_decay_time as number)).toBeCloseTo(4)
  })

  it.each([
    ['1/1', 6, 1],
    ['1/2', 7, 1],
    ['1/4', 8, 1],
    ['1/8', 9, 1],
    ['1/8T', 9, 3],
    ['1/16', 10, 1],
    ['1/16T', 10, 3],
    ['1/32', 11, 1],
    ['1/64', 12, 1],
  ] as const)('maps delay division %s to Vital tempo %s and sync mode %s', (division, tempo, sync) => {
    const patch = createDefaultPatch()
    patch.effects.delay.mode = 'sync'
    patch.effects.delay.division = division
    const settings = realAdapter().exportPatch(patch).document.settings

    expect(settings.delay_tempo).toBe(tempo)
    expect(settings.delay_aux_tempo).toBe(tempo)
    expect(settings.delay_sync).toBe(sync)
    expect(settings.delay_aux_sync).toBe(sync)
  })

  it.each([1 / 512, 0.125, 0.25, 1, 4])(
    'maps free delay time %s seconds through both fixture-backed frequency keys',
    (seconds) => {
      const patch = createDefaultPatch()
      patch.effects.delay.mode = 'free'
      patch.effects.delay.timeSeconds = seconds
      const settings = realAdapter().exportPatch(patch).document.settings

      expect(settings.delay_sync).toBe(0)
      expect(settings.delay_aux_sync).toBe(0)
      expect(decodeVitalDelaySeconds(settings.delay_frequency as number)).toBeCloseTo(seconds)
      expect(decodeVitalDelaySeconds(settings.delay_aux_frequency as number)).toBeCloseTo(
        seconds,
      )
    },
  )

  it('uses ENV 1 as the amp envelope and routes all oscillators through the FX chain', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as { settings: Record<string, unknown> }
    const patch = createDefaultPatch()
    patch.ampEnvelope = {
      ...patch.ampEnvelope,
      attackSeconds: 0.32,
      holdSeconds: 0.12,
      decaySeconds: 1.7,
      sustainLevel: 0.46,
      releaseSeconds: 2.4,
    }
    const settings = realAdapter().exportPatch(patch).document.settings

    expect(decodeVitalEnvelopeSeconds(settings.env_1_attack as number)).toBeCloseTo(0.32)
    expect(decodeVitalEnvelopeSeconds(settings.env_1_hold as number)).toBeCloseTo(0.12)
    expect(decodeVitalEnvelopeSeconds(settings.env_1_decay as number)).toBeCloseTo(1.7)
    expect(settings.env_1_sustain).toBe(0.46)
    expect(decodeVitalEnvelopeSeconds(settings.env_1_release as number)).toBeCloseTo(2.4)
    expect(settings).toMatchObject({
      osc_1_destination: 3,
      osc_2_destination: 3,
      osc_3_destination: 3,
      filter_1_on: 0,
      filter_2_on: 0,
      filter_fx_on: 1,
    })
    expect(settings.env_1_delay).toBe(fixture.settings.env_1_delay)
    for (const key of ['env_3_attack', 'env_3_decay', 'env_3_sustain', 'env_3_release']) {
      expect(settings[key]).toBe(fixture.settings[key])
    }
    for (const key of ['filter_2_cutoff', 'filter_2_resonance', 'filter_2_style']) {
      expect(settings[key]).toBe(fixture.settings[key])
    }
  })
})
