import { expect, test } from '@playwright/test'

test('offline modulation direction covers LFO gate, mod envelope, delay tail, and reverb tail', async ({
  page,
}) => {
  await page.goto('/')

  const metrics = await page.evaluate(async () => {
    type Metrics = {
      rms: number
      tailRms: number
      tailCrestFactor: number
      highFrequencyEnergy: number
    }
    type Patch = ReturnType<(typeof import('../../src/patch/defaults'))['createDefaultPatch']>
    const loadModules = new Function(
      'return Promise.all([import("/src/patch/defaults.ts"), import("/src/audio/offline.ts")])',
    ) as () => Promise<
      [
        { createDefaultPatch: () => Patch },
        {
          renderOfflineVoice: (
            patch: Patch,
            options: Record<string, number | boolean>,
          ) => Promise<Metrics>
        },
      ]
    >
    const [{ createDefaultPatch }, { renderOfflineVoice }] = await loadModules()
    const createBase = () => {
      const patch = createDefaultPatch()
      patch.oscillators[0].unisonVoices = 1
      patch.oscillators[0].randomPhase = 0
      patch.oscillators[1].enabled = false
      patch.ampEnvelope = {
        attackSeconds: 0.005,
        holdSeconds: 0,
        decaySeconds: 0.02,
        sustainLevel: 0.8,
        releaseSeconds: 0.04,
      }
      patch.effects.delay.enabled = false
      patch.effects.reverb.enabled = false
      return patch
    }
    const render = (patch: Patch, options: Record<string, number | boolean>) =>
      renderOfflineVoice(patch, { sampleRate: 24_000, midi: 60, velocity: 1, ...options })

    const ungated = createBase()
    ungated.modulations = []
    const gated = structuredClone(ungated)
    gated.lfo1 = {
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
    staticFilter.modulations = []
    const envelopeFilter = structuredClone(staticFilter)
    envelopeFilter.modEnvelope = {
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
    wetReverb.effects.reverb = { enabled: true, mix: 0.55, decaySeconds: 1.8, size: 0.8 }

    const [
      ungatedMetrics,
      gatedMetrics,
      staticFilterMetrics,
      envelopeFilterMetrics,
      dryDelayMetrics,
      wetDelayMetrics,
      dryReverbMetrics,
      wetReverbMetrics,
    ] = await Promise.all([
      render(ungated, {
        durationSeconds: 1,
        noteOffSeconds: 0.7,
        includeModulation: true,
      }),
      render(gated, {
        durationSeconds: 1,
        noteOffSeconds: 0.7,
        includeModulation: true,
      }),
      render(staticFilter, {
        durationSeconds: 0.8,
        noteOffSeconds: 0.6,
        includeModulation: true,
      }),
      render(envelopeFilter, {
        durationSeconds: 0.8,
        noteOffSeconds: 0.6,
        includeModulation: true,
      }),
      render(dryDelay, {
        durationSeconds: 1.5,
        noteOffSeconds: 0.12,
        includeEffects: true,
      }),
      render(wetDelay, {
        durationSeconds: 1.5,
        noteOffSeconds: 0.12,
        includeEffects: true,
      }),
      render(dryReverb, {
        durationSeconds: 1.5,
        noteOffSeconds: 0.12,
        includeEffects: true,
      }),
      render(wetReverb, {
        durationSeconds: 1.5,
        noteOffSeconds: 0.12,
        includeEffects: true,
      }),
    ])

    return {
      ungated: ungatedMetrics,
      gated: gatedMetrics,
      staticFilter: staticFilterMetrics,
      envelopeFilter: envelopeFilterMetrics,
      dryDelay: dryDelayMetrics,
      wetDelay: wetDelayMetrics,
      dryReverb: dryReverbMetrics,
      wetReverb: wetReverbMetrics,
    }
  })

  expect(metrics.gated.rms).toBeGreaterThan(metrics.ungated.rms * 1.05)
  expect(metrics.envelopeFilter.highFrequencyEnergy).toBeGreaterThan(
    metrics.staticFilter.highFrequencyEnergy * 1.05,
  )
  expect(metrics.wetDelay.tailRms).toBeGreaterThan(metrics.dryDelay.tailRms + 0.00001)
  expect(metrics.wetReverb.tailRms).toBeGreaterThan(metrics.dryReverb.tailRms + 0.00001)
  expect(metrics.wetReverb.tailCrestFactor).toBeLessThan(6)
})
