import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { renderVitalOffline, type VitalOfflineRender } from '../../src/audio/vital/offlineRender'
import { createDefaultPatch } from '../../src/patch/defaults'
import type { FilterType, PatchState } from '../../src/patch/types'
import { getPresetPatch } from '../../src/presets/registry'
import {
  CALIBRATION_A_PATCH,
  CALIBRATION_F_PATCH,
  CALIBRATION_H_PATCH,
} from '../../src/presets/patches/calibration'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()
const adapter = new VitalPresetAdapter(
  JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')) as unknown,
)
let factory: VitalWasmModuleFactory

describe.skipIf(artifact === null)('Vital WASM PatchState v2 effect model', () => {
  beforeAll(async () => {
    if (artifact === null) return
    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    factory = imported.default
  })

  it.each<FilterType>(['lowpass', 'highpass', 'bandpass', 'notch'])(
    'loads and renders the %s FX filter',
    async (type) => {
      const patch = createDefaultPatch()
      patch.oscillators[1].enabled = false
      patch.oscillators[2].enabled = false
      patch.effects.delay.enabled = false
      patch.effects.reverb.enabled = false
      patch.filter.enabled = true
      patch.filter.type = type
      const render = await renderPatch(patch, 0.35, 0.2)

      expect(render.metrics.nonFiniteSamples).toBe(0)
      expect(render.metrics.rms).toBeGreaterThan(0)
      expect(render.metrics.peak).toBeLessThanOrEqual(1)
      expect(render.metrics.audibleBlocks).toBeGreaterThan(0)
    },
    60_000,
  )

  it('renders an oscillator-3-only patch and settles after all-notes-off', async () => {
    const patch = oscillatorThreeOnlyPatch()
    const engine = await createEngine()
    const left = new Float32Array(128)
    const right = new Float32Array(128)

    try {
      expect(engine.loadState(adapter.exportPatch(patch).json)).toBe(true)
      engine.setBpm(120)
      engine.noteOn(60, 100 / 127)

      let audiblePeak = 0
      let nonFiniteSamples = 0
      for (let block = 0; block < 96; block += 1) {
        engine.process(128)
        engine.copyStereoTo(left, right, 128)
        for (let frame = 0; frame < 128; frame += 1) {
          if (!Number.isFinite(left[frame])) nonFiniteSamples += 1
          if (!Number.isFinite(right[frame])) nonFiniteSamples += 1
          audiblePeak = Math.max(audiblePeak, Math.abs(left[frame]), Math.abs(right[frame]))
        }
      }

      engine.allNotesOff()
      let settledPeak = 0
      for (let block = 0; block < 256; block += 1) {
        engine.process(128)
        engine.copyStereoTo(left, right, 128)
        if (block === 255) {
          for (let frame = 0; frame < 128; frame += 1) {
            settledPeak = Math.max(settledPeak, Math.abs(left[frame]), Math.abs(right[frame]))
          }
        }
      }

      expect(nonFiniteSamples).toBe(0)
      expect(audiblePeak).toBeGreaterThan(1e-3)
      expect(audiblePeak).toBeLessThanOrEqual(1)
      expect(settledPeak).toBeLessThan(1e-7)
    } finally {
      engine.dispose()
    }
  }, 60_000)

  it('applies the fixed global LFO to an oscillator-3-only patch', async () => {
    const staticPatch = oscillatorThreeOnlyPatch()
    const modulatedPatch = structuredClone(staticPatch)
    modulatedPatch.lfo1 = structuredClone(CALIBRATION_F_PATCH.lfo1)
    const exported = adapter.exportPatch(modulatedPatch).document.settings
    expect((exported.modulations as Array<Record<string, unknown>>)[2]).toEqual({
      source: 'lfo_1',
      destination: 'osc_3_level',
    })

    const staticRender = await renderPatch(staticPatch, 0.8, 0.2)
    const modulatedRender = await renderPatch(modulatedPatch, 0.8, 0.2)
    expect(staticRender.metrics.nonFiniteSamples).toBe(0)
    expect(modulatedRender.metrics.nonFiniteSamples).toBe(0)
    expect(staticRender.metrics.rms).toBeGreaterThan(0)
    expect(modulatedRender.metrics.rms).toBeGreaterThan(0)
    expect(stereoDifferenceRms(staticRender, modulatedRender)).toBeGreaterThan(1e-4)
  }, 120_000)

  it.each(['warm-mono-bass', 'calibration-b-custom-wavetable'])(
    'makes the fixed global LFO audible for %s',
    async (presetId) => {
      const disabled = getPresetPatch(presetId)
      disabled.lfo1.enabled = false
      const enabled = structuredClone(disabled)
      enabled.lfo1.enabled = true

      const disabledRender = await renderPatch(disabled, 2, 0.2)
      const enabledRender = await renderPatch(enabled, 2, 0.2)
      expect(disabledRender.metrics.rms).toBeGreaterThan(0)
      expect(enabledRender.metrics.rms).toBeGreaterThan(0)
      expect(stereoDifferenceRms(disabledRender, enabledRender)).toBeGreaterThan(1e-4)
    },
    120_000,
  )

  it('renders a measurably different signal when enabled FX processors are reordered', async () => {
    const filterFirst = structuredClone(CALIBRATION_H_PATCH)
    filterFirst.effects.order = [
      'filter',
      'delay',
      'reverb',
      'distortion',
      'compressor',
      'chorus',
    ]
    const filterLast = structuredClone(filterFirst)
    filterLast.effects.order = [
      'delay',
      'reverb',
      'filter',
      'distortion',
      'compressor',
      'chorus',
    ]

    const first = await renderPatch(filterFirst, 0.4, 0.8)
    const last = await renderPatch(filterLast, 0.4, 0.8)

    expect(first.metrics.nonFiniteSamples).toBe(0)
    expect(last.metrics.nonFiniteSamples).toBe(0)
    expect(stereoDifferenceRms(first, last)).toBeGreaterThan(1e-5)
  }, 120_000)

  it('accepts adapter-derived FX filter and order controls without a state reload', async () => {
    const engine = await createEngine()
    const before = createDefaultPatch()
    const after = structuredClone(before)
    after.filter.type = 'notch'
    after.filter.cutoffHz = 1_200
    after.filter.resonance = 0.7
    after.effects.order = ['reverb', 'filter', 'delay', 'chorus', 'compressor', 'distortion']

    try {
      expect(engine.loadState(adapter.exportPatch(before).json)).toBe(true)
      const operations = adapter.controlOperations(before, after)
      expect(operations.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          'filter_fx_cutoff',
          'filter_fx_resonance',
          'filter_fx_style',
          'filter_fx_blend',
          'effect_chain_order',
        ]),
      )
      for (const operation of operations) {
        expect(engine.setControl(operation.name, operation.value), operation.name).toBe(true)
      }
    } finally {
      engine.dispose()
    }
  }, 60_000)
})

async function createEngine(): Promise<VitalEngine> {
  if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')
  return VitalEngine.create(factory, 48_000, {
    locateFile: (path) => resolve(dirname(artifact), path),
  })
}

async function renderPatch(
  patch: PatchState,
  holdSeconds: number,
  tailSeconds: number,
): Promise<VitalOfflineRender> {
  const engine = await createEngine()
  try {
    expect(engine.loadState(adapter.exportPatch(patch).json)).toBe(true)
    return renderVitalOffline(engine, { holdSeconds, tailSeconds })
  } finally {
    engine.dispose()
  }
}

function stereoDifferenceRms(left: VitalOfflineRender, right: VitalOfflineRender): number {
  let sumSquares = 0
  const frames = Math.min(left.left.length, right.left.length)
  for (let frame = 0; frame < frames; frame += 1) {
    const leftDifference = left.left[frame] - right.left[frame]
    const rightDifference = left.right[frame] - right.right[frame]
    sumSquares += leftDifference * leftDifference + rightDifference * rightDifference
  }
  return Math.sqrt(sumSquares / Math.max(1, frames * 2))
}

function oscillatorThreeOnlyPatch(): PatchState {
  const patch = structuredClone(CALIBRATION_A_PATCH)
  patch.oscillators[0].enabled = false
  patch.oscillators[1].enabled = false
  patch.oscillators[2] = {
    ...structuredClone(CALIBRATION_A_PATCH.oscillators[0]),
    enabled: true,
  }
  patch.filter.enabled = false
  patch.lfo1.enabled = false
  patch.modulations = []
  patch.effects.delay.enabled = false
  patch.effects.reverb.enabled = false
  return patch
}
