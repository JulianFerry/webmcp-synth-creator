import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import {
  renderVitalOffline,
  type VitalOfflineMetrics,
  type VitalOfflineRender,
  type VitalOfflineRenderOptions,
} from '../../src/audio/vital/offlineRender'
import { vitalEnginePayload } from '../../src/audio/vital/state'
import { createDefaultPatch } from '../../src/patch/defaults'
import {
  CALIBRATION_A_PATCH,
  CALIBRATION_B_PATCH,
  CALIBRATION_C_PATCH,
  CALIBRATION_D_PATCH,
  CALIBRATION_E_PATCH,
  CALIBRATION_F_PATCH,
  CALIBRATION_G_PATCH,
  CALIBRATION_H_PATCH,
} from '../../src/presets/patches/calibration'
import type { PatchState } from '../../src/patch/types'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()
const sampleRate = 48_000
const adapter = new VitalPresetAdapter(
  JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')) as unknown,
)
let factory: VitalWasmModuleFactory

describe.skipIf(artifact === null)('Vital WASM directional acoustics', () => {
  beforeAll(async () => {
    if (artifact === null) return
    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    factory = imported.default
  })

  it('identifies each cumulative A-H subsystem in the rendered signal', async () => {
    const patches = [
      CALIBRATION_A_PATCH,
      CALIBRATION_B_PATCH,
      CALIBRATION_C_PATCH,
      CALIBRATION_D_PATCH,
      CALIBRATION_E_PATCH,
      CALIBRATION_F_PATCH,
      CALIBRATION_G_PATCH,
      CALIBRATION_H_PATCH,
    ]
    const [a, b, c, d, e, f, g, h] = await renderInSequence(
      patches.map((patch) => ({ patch })),
    )
    const fCycleCorrelation = correlation(
      blockRmsValues(f, 0.5, 0.75, 0.005),
      blockRmsValues(f, 0.75, 1, 0.005),
    )
    const eVariation = blockRmsVariation(e, 0.5, 1.5, 0.01)
    const fVariation = blockRmsVariation(f, 0.5, 1.5, 0.01)

    console.info(
      `[vital-directional] ladder=${JSON.stringify({
        rms: patches.map((_, index) => [a, b, c, d, e, f, g, h][index].metrics.rms),
        centroidHz: patches.map(
          (_, index) => [a, b, c, d, e, f, g, h][index].metrics.spectralCentroidHz,
        ),
        stereoDifferenceRms: { c: c.metrics.stereoDifferenceRms, d: d.metrics.stereoDifferenceRms },
        cAttackRms: rmsBetween(c, 0, 0.05),
        bAttackRms: rmsBetween(b, 0, 0.05),
        cReleaseRms: rmsBetween(c, 2.05, 2.65),
        bReleaseRms: rmsBetween(b, 2.05, 2.65),
        eVariation,
        fVariation,
        fCycleCorrelation,
        gTailRms: g.metrics.tailRms,
        hTailRms: h.metrics.tailRms,
      })}`,
    )

    expect(a.metrics.rms).toBeGreaterThan(0.01)
    expect(b.metrics.spectralCentroidHz).toBeGreaterThan(a.metrics.spectralCentroidHz * 2)
    expect(rmsBetween(c, 0, 0.05)).toBeLessThan(rmsBetween(b, 0, 0.05) * 0.75)
    expect(rmsBetween(c, 2.05, 2.65)).toBeGreaterThan(rmsBetween(b, 2.05, 2.65) + 0.001)
    expect(d.metrics.stereoDifferenceRms).toBeGreaterThan(c.metrics.stereoDifferenceRms + 0.001)
    expect(e.metrics.spectralCentroidHz).toBeLessThan(d.metrics.spectralCentroidHz * 0.75)
    expect(fVariation).toBeGreaterThan(eVariation * 2)
    expect(fCycleCorrelation).toBeGreaterThan(0.98)
    expect(g.metrics.rms).toBeGreaterThan(f.metrics.rms * 2)
    expect(h.metrics.tailRms).toBeGreaterThan(g.metrics.tailRms + 0.00001)
  }, 180_000)

  it('ports oscillator, level, pitch, envelope, and filter direction checks to Vital', async () => {
    const base = createDefaultPatch()
    base.oscillators[0].unisonVoices = 1
    base.oscillators[0].randomPhase = 0
    base.oscillators[1].unisonVoices = 1
    base.oscillators[1].enabled = false
    base.ampEnvelope = {
      ...base.ampEnvelope,
      attackSeconds: 0.01,
      holdSeconds: 0,
      decaySeconds: 0.03,
      sustainLevel: 0.8,
      releaseSeconds: 0.08,
    }
    base.filter.enabled = true
    base.filter.cutoffHz = 8_000
    base.filter.resonance = 0
    base.effects.delay.enabled = false
    base.effects.reverb.enabled = false
    base.modulations = []

    const silent = structuredClone(base)
    silent.oscillators[0].enabled = false
    const quiet = structuredClone(base)
    quiet.oscillators[0].level = base.oscillators[0].level * 0.2
    const sine = structuredClone(base)
    sine.oscillators[0].wavetableId = 'sine'
    const highPitch = structuredClone(sine)
    highPitch.oscillators[0].transposeSemitones = 12
    const longRelease = structuredClone(base)
    longRelease.ampEnvelope.releaseSeconds = 0.55
    const dark = structuredClone(base)
    dark.filter.cutoffHz = 450
    const options = { holdSeconds: 0.2, tailSeconds: 0.7, velocity: 1 }

    const [baseRender, silentRender, quietRender, sineRender, highPitchRender, longRender, darkRender] =
      await renderInSequence([
        { patch: base, options },
        { patch: silent, options },
        { patch: quiet, options },
        { patch: sine, options },
        { patch: highPitch, options },
        { patch: longRelease, options },
        { patch: dark, options },
      ])

    console.info(
      `[vital-directional] voice=${JSON.stringify({
        base: summarize(baseRender.metrics),
        silent: summarize(silentRender.metrics),
        quiet: summarize(quietRender.metrics),
        sine: summarize(sineRender.metrics),
        highPitch: summarize(highPitchRender.metrics),
        longRelease: summarize(longRender.metrics),
        dark: summarize(darkRender.metrics),
      })}`,
    )

    expect(baseRender.metrics.rms).toBeGreaterThan(0.001)
    expect(silentRender.metrics.rms).toBeLessThan(baseRender.metrics.rms * 0.02)
    expect(quietRender.metrics.rms).toBeLessThan(baseRender.metrics.rms * 0.45)
    expect(highPitchRender.metrics.spectralCentroidHz).toBeGreaterThan(
      sineRender.metrics.spectralCentroidHz * 1.7,
    )
    expect(longRender.metrics.activeDurationSeconds).toBeGreaterThan(
      baseRender.metrics.activeDurationSeconds + 0.2,
    )
    expect(darkRender.metrics.highFrequencyEnergy).toBeLessThan(
      baseRender.metrics.highFrequencyEnergy * 0.65,
    )
  }, 180_000)

  it('ports LFO, modulation-envelope, delay, and reverb direction checks to Vital', async () => {
    const createBase = () => {
      const patch = createDefaultPatch()
      patch.oscillators[0].unisonVoices = 1
      patch.oscillators[0].randomPhase = 0
      patch.oscillators[1].enabled = false
      patch.ampEnvelope = {
        ...patch.ampEnvelope,
        attackSeconds: 0.005,
        holdSeconds: 0,
        decaySeconds: 0.02,
        sustainLevel: 0.8,
        releaseSeconds: 0.04,
      }
      patch.effects.delay.enabled = false
      patch.effects.reverb.enabled = false
      patch.modulations = []
      return patch
    }

    const ungated = createBase()
    const gated = structuredClone(ungated)
    gated.lfo1 = {
      ...gated.lfo1,
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 0.04, y: 1 },
        { x: 0.18, y: 1 },
        { x: 0.22, y: 0 },
        { x: 1, y: 0 },
      ],
      rate: { mode: 'sync', division: '1/8' },
      phase: 0,
      smooth: false,
    }
    gated.modulations = [
      {
        id: 'deep-gate',
        source: 'lfo1',
        destination: 'oscillator1.level',
        amount: 0.9,
        bipolar: false,
      },
    ]

    const staticFilter = createBase()
    staticFilter.filter.cutoffHz = 800
    const envelopeFilter = structuredClone(staticFilter)
    envelopeFilter.modEnvelope = {
      ...envelopeFilter.modEnvelope,
      attackSeconds: 0.08,
      holdSeconds: 0,
      decaySeconds: 0.12,
      sustainLevel: 0,
      releaseSeconds: 0.05,
    }
    envelopeFilter.modulations = [
      {
        id: 'env-filter',
        source: 'modEnvelope',
        destination: 'filter.cutoff',
        amount: 0.85,
        bipolar: false,
      },
    ]

    const dryDelay = createBase()
    const wetDelay = structuredClone(dryDelay)
    wetDelay.effects.delay = {
      enabled: true,
      mode: 'free',
      division: '1/8',
      timeSeconds: 0.12,
      feedback: 0.62,
      mix: 0.5,
    }
    const dryReverb = createBase()
    const wetReverb = structuredClone(dryReverb)
    wetReverb.effects.reverb = {
      ...wetReverb.effects.reverb,
      enabled: true,
      mix: 0.55,
      decaySeconds: 1.8,
      size: 0.8,
    }

    const [
      ungatedRender,
      gatedRender,
      staticFilterRender,
      envelopeFilterRender,
      dryDelayRender,
      wetDelayRender,
      dryReverbRender,
      wetReverbRender,
    ] = await renderInSequence([
      { patch: ungated, options: { holdSeconds: 0.7, tailSeconds: 0.3, velocity: 1 } },
      { patch: gated, options: { holdSeconds: 0.7, tailSeconds: 0.3, velocity: 1 } },
      { patch: staticFilter, options: { holdSeconds: 0.6, tailSeconds: 0.2, velocity: 1 } },
      { patch: envelopeFilter, options: { holdSeconds: 0.6, tailSeconds: 0.2, velocity: 1 } },
      { patch: dryDelay, options: { holdSeconds: 0.12, tailSeconds: 1.38, velocity: 1 } },
      { patch: wetDelay, options: { holdSeconds: 0.12, tailSeconds: 1.38, velocity: 1 } },
      { patch: dryReverb, options: { holdSeconds: 0.12, tailSeconds: 1.38, velocity: 1 } },
      { patch: wetReverb, options: { holdSeconds: 0.12, tailSeconds: 1.38, velocity: 1 } },
    ])

    console.info(
      `[vital-directional] modulation=${JSON.stringify({
        ungated: summarize(ungatedRender.metrics),
        gated: summarize(gatedRender.metrics),
        staticFilter: summarize(staticFilterRender.metrics),
        envelopeFilter: summarize(envelopeFilterRender.metrics),
        dryDelay: summarize(dryDelayRender.metrics),
        wetDelay: summarize(wetDelayRender.metrics),
        dryReverb: summarize(dryReverbRender.metrics),
        wetReverb: summarize(wetReverbRender.metrics),
      })}`,
    )

    expect(gatedRender.metrics.rms).toBeGreaterThan(ungatedRender.metrics.rms * 1.05)
    expect(envelopeFilterRender.metrics.highFrequencyEnergy).toBeGreaterThan(
      staticFilterRender.metrics.highFrequencyEnergy * 1.05,
    )
    expect(wetDelayRender.metrics.tailRms).toBeGreaterThan(
      dryDelayRender.metrics.tailRms + 0.00001,
    )
    expect(wetReverbRender.metrics.tailRms).toBeGreaterThan(
      dryReverbRender.metrics.tailRms + 0.00001,
    )
    expect(wetReverbRender.metrics.tailCrestFactor).toBeLessThan(6)
  }, 180_000)
})

async function renderPatch(
  patch: PatchState,
  options: VitalOfflineRenderOptions = {},
): Promise<VitalOfflineRender> {
  if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')
  const engine = await VitalEngine.create(factory, sampleRate, {
    locateFile: (path) => resolve(dirname(artifact), path),
  })
  try {
    expect(engine.loadState(vitalEnginePayload(adapter, patch))).toBe(true)
    return renderVitalOffline(engine, options)
  } finally {
    engine.dispose()
  }
}

async function renderInSequence(
  cases: Array<{ patch: PatchState; options?: VitalOfflineRenderOptions }>,
): Promise<VitalOfflineRender[]> {
  const renders: VitalOfflineRender[] = []
  for (const renderCase of cases) {
    renders.push(await renderPatch(renderCase.patch, renderCase.options))
  }
  return renders
}

function rmsBetween(render: VitalOfflineRender, startSeconds: number, endSeconds: number): number {
  const startFrame = Math.round(startSeconds * render.sampleRate)
  const endFrame = Math.min(render.left.length, Math.round(endSeconds * render.sampleRate))
  let sumSquares = 0
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    sumSquares += render.left[frame] * render.left[frame] + render.right[frame] * render.right[frame]
  }
  return Math.sqrt(sumSquares / Math.max(1, (endFrame - startFrame) * 2))
}

function blockRmsVariation(
  render: VitalOfflineRender,
  startSeconds: number,
  endSeconds: number,
  blockSeconds: number,
): number {
  const values = blockRmsValues(render, startSeconds, endSeconds, blockSeconds)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function blockRmsValues(
  render: VitalOfflineRender,
  startSeconds: number,
  endSeconds: number,
  blockSeconds: number,
): Float32Array {
  const values: number[] = []
  for (let start = startSeconds; start < endSeconds; start += blockSeconds) {
    values.push(rmsBetween(render, start, Math.min(endSeconds, start + blockSeconds)))
  }
  return Float32Array.from(values)
}

function correlation(left: Float32Array, right: Float32Array): number {
  let dot = 0
  let leftSquared = 0
  let rightSquared = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index]
    leftSquared += left[index] * left[index]
    rightSquared += right[index] * right[index]
  }
  return dot / Math.sqrt(leftSquared * rightSquared)
}

function summarize(metrics: VitalOfflineMetrics): Record<string, number> {
  return {
    activeDurationSeconds: metrics.activeDurationSeconds,
    highFrequencyEnergy: metrics.highFrequencyEnergy,
    rms: metrics.rms,
    spectralCentroidHz: metrics.spectralCentroidHz,
    tailCrestFactor: metrics.tailCrestFactor,
    tailRms: metrics.tailRms,
    zeroCrossingHz: metrics.zeroCrossingHz,
  }
}
