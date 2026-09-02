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

  it('renders a measurably different signal when the free-running chorus rate changes', async () => {
    const slow = createDefaultPatch()
    slow.filter.enabled = false
    slow.lfo1.enabled = false
    slow.lfo2.enabled = false
    slow.effects.delay.enabled = false
    slow.effects.reverb.enabled = false
    slow.effects.distortion.enabled = false
    slow.effects.chorus.enabled = true
    slow.effects.chorus.mix = 1
    slow.effects.chorus.depth = 1
    slow.effects.chorus.feedback = 0.5
    slow.effects.chorus.rate = 0
    const fast = structuredClone(slow)
    fast.effects.chorus.rate = 1

    const slowRender = await renderPatch(slow, 1, 0.2)
    const fastRender = await renderPatch(fast, 1, 0.2)

    expect(slowRender.metrics.nonFiniteSamples).toBe(0)
    expect(fastRender.metrics.nonFiniteSamples).toBe(0)
    expect(stereoDifferenceRms(slowRender, fastRender)).toBeGreaterThan(1e-4)
  }, 120_000)

  it.each([
    ['distortion', 'centroid', 1] as const,
    ['chorus', 'rms', 1] as const,
    ['compressor', 'rms', -1] as const,
  ])('moves the %s DSP metric directionally when enabled', async (effect, metric, direction) => {
    const disabled = isolatedEffectPatch()
    disabled.effects[effect].enabled = false
    const enabled = structuredClone(disabled)
    enabled.effects[effect].enabled = true

    const disabledRender = await renderPatch(disabled, 0.8, 0.1)
    const enabledRender = await renderPatch(enabled, 0.8, 0.1)
    const disabledMetric = metric === 'rms' ? disabledRender.metrics.rms : spectralCentroid(disabledRender)
    const enabledMetric = metric === 'rms' ? enabledRender.metrics.rms : spectralCentroid(enabledRender)

    expect((enabledMetric - disabledMetric) * direction).toBeGreaterThan(1e-4)
  }, 120_000)

  it.each([
    ['distortion.drive', 'rms'] as const,
    ['chorus.rate', 'rms'] as const,
    ['chorus.mix', 'rms'] as const,
    ['compressor.amount', 'rms'] as const,
  ])('changes %s monotonically across its normalized range', async (path, metric) => {
    const values = []
    for (const amount of [0, 0.5, 1]) {
      const patch = isolatedEffectPatch()
      const [effect, field] = path.split('.') as ['distortion' | 'chorus' | 'compressor', string]
      patch.effects[effect].enabled = true
      ;(patch.effects[effect] as unknown as Record<string, number>)[field] = amount
      const render = await renderPatch(patch, 0.8, 0.1)
      values.push(metric === 'rms' ? render.metrics.rms : spectralCentroid(render))
    }
    expectMonotone(values)
  }, 180_000)

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

function isolatedEffectPatch(): PatchState {
  const patch = createDefaultPatch()
  patch.filter.enabled = false
  patch.lfo1.enabled = false
  patch.lfo2.enabled = false
  patch.effects.distortion = { enabled: false, type: 'hard_clip', drive: 0.8, mix: 1 }
  patch.effects.chorus = { enabled: false, voices: 4, rate: 0.5, depth: 1, feedback: 0.5, mix: 1 }
  patch.effects.compressor = { enabled: false, bands: 'multiband', amount: 0.8, attack: 0.5, release: 0.5, mix: 1 }
  patch.effects.delay.enabled = false
  patch.effects.reverb.enabled = false
  return patch
}

function spectralCentroid(render: VitalOfflineRender): number {
  const size = Math.min(4096, render.left.length)
  let weighted = 0
  let magnitudeSum = 0
  for (let bin = 1; bin <= 512; bin += 1) {
    let real = 0
    let imaginary = 0
    for (let sample = 0; sample < size; sample += 1) {
      const value = (render.left[sample] + render.right[sample]) * 0.5
      const angle = 2 * Math.PI * bin * sample / size
      real += value * Math.cos(angle)
      imaginary -= value * Math.sin(angle)
    }
    const magnitude = Math.hypot(real, imaginary)
    weighted += bin * 48_000 / size * magnitude
    magnitudeSum += magnitude
  }
  return weighted / Math.max(Number.EPSILON, magnitudeSum)
}

function expectMonotone(values: number[]): void {
  const deltas = values.slice(1).map((value, index) => value - values[index])
  const direction = Math.sign(deltas.find((delta) => Math.abs(delta) > 1e-6) ?? 0)
  expect(direction).not.toBe(0)
  expect(deltas.every((delta) => delta * direction >= -1e-6), JSON.stringify(values)).toBe(true)
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
