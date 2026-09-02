import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

const artifactPresent = ['vital.mjs', 'vital.wasm'].every((filename) =>
  existsSync(resolve(process.cwd(), 'wasm/vital/build', filename)),
)

test.describe('Vital AudioWorklet', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!artifactPresent, 'Vital WASM artifact is not built')

  test('renders finite audio, coalesces state, and honors all-notes-off', async ({ page }) => {
    await page.goto('/')

    const result = await page.evaluate(async () => {
      type HostModule = typeof import('../../src/audio/vital/VitalWorkletHost')
      type AdapterModule = typeof import('../../src/vital/VitalPresetAdapter')
      type CalibrationModule = typeof import('../../src/presets/patches/calibration')

      const loadModules = new Function(
        'return Promise.all([import("/src/audio/vital/VitalWorkletHost.ts"), import("/src/vital/VitalPresetAdapter.ts"), import("/src/presets/patches/calibration.ts")])',
      ) as () => Promise<[HostModule, AdapterModule, CalibrationModule]>
      const [{ VitalWorkletHost }, { VitalPresetAdapter }, { CALIBRATION_A_PATCH }] =
        await loadModules()
      const adapter = await VitalPresetAdapter.fromUrl()
      const json = adapter.exportPatch(CALIBRATION_A_PATCH).json
      const initialSettings = (JSON.parse(json) as { settings: Record<string, number> }).settings

      async function render(playNote: boolean) {
        const context = new OfflineAudioContext(2, 24_000, 48_000)
        const host = new VitalWorkletHost(context)
        const appliedRevisions: number[] = []
        const controlRevisions: number[] = []
        const errors: Array<{ phase: string; message: string }> = []
        host.subscribe((event) => {
          if (event.type === 'state-applied') appliedRevisions.push(event.revision)
          if (event.type === 'controls-applied') controlRevisions.push(event.revision)
          if (event.type === 'error') errors.push({ phase: event.phase, message: event.message })
        })

        host.loadState(1, json)
        host.loadState(3, json)
        host.loadState(2, json)
        host.setControls(4, [
          { name: 'filter_fx_cutoff', value: initialSettings.filter_fx_cutoff - 3 },
        ])
        host.setControls(6, [
          { name: 'filter_fx_cutoff', value: initialSettings.filter_fx_cutoff - 6 },
        ])
        const staleControlsAccepted = host.setControls(5, [
          { name: 'filter_fx_cutoff', value: initialSettings.filter_fx_cutoff },
        ])
        host.setBpm(120)
        host.noteOn(60, 100 / 127)
        if (!playNote) host.allNotesOff()
        await host.prepare()

        const buffer = await context.startRendering()
        await new Promise((resolveMessageEvents) => setTimeout(resolveMessageEvents, 0))
        host.dispose()

        let nonFiniteSamples = 0
        let peak = 0
        let sumSquares = 0
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const samples = buffer.getChannelData(channel)
          for (let frame = 0; frame < samples.length; frame += 1) {
            const sample = samples[frame]
            if (!Number.isFinite(sample)) {
              nonFiniteSamples += 1
              continue
            }
            peak = Math.max(peak, Math.abs(sample))
            sumSquares += sample * sample
          }
        }

        return {
          appliedRevisions,
          controlRevisions,
          errors,
          nonFiniteSamples,
          peak,
          rms: Math.sqrt(sumSquares / (buffer.length * buffer.numberOfChannels)),
          staleControlsAccepted,
        }
      }

      return {
        audible: await render(true),
        silenced: await render(false),
      }
    })

    expect(result.audible.errors).toEqual([])
    expect(result.audible.nonFiniteSamples).toBe(0)
    expect(result.audible.rms).toBeGreaterThan(0)
    expect(result.audible.peak).toBeGreaterThan(0)
    expect(result.audible.peak).toBeLessThanOrEqual(1)
    expect(result.audible.appliedRevisions).toEqual([3])
    expect(result.audible.controlRevisions).toEqual([6])
    expect(result.audible.staleControlsAccepted).toBe(false)

    expect(result.silenced.errors).toEqual([])
    expect(result.silenced.nonFiniteSamples).toBe(0)
    expect(result.silenced.rms).toBeLessThan(1e-8)
    expect(result.silenced.peak).toBeLessThan(1e-7)
    expect(result.silenced.appliedRevisions).toEqual([3])
    expect(result.silenced.controlRevisions).toEqual([6])
    expect(result.silenced.staleControlsAccepted).toBe(false)
  })

  test('keeps a held note continuous while switching calibration state', async ({ page }) => {
    await page.goto('/')

    const result = await page.evaluate(async () => {
      type HostModule = typeof import('../../src/audio/vital/VitalWorkletHost')
      type AdapterModule = typeof import('../../src/vital/VitalPresetAdapter')
      type CalibrationModule = typeof import('../../src/presets/patches/calibration')

      const loadModules = new Function(
        'return Promise.all([import("/src/audio/vital/VitalWorkletHost.ts"), import("/src/vital/VitalPresetAdapter.ts"), import("/src/presets/patches/calibration.ts")])',
      ) as () => Promise<[HostModule, AdapterModule, CalibrationModule]>
      const [
        { VitalWorkletHost },
        { VitalPresetAdapter },
        { CALIBRATION_A_PATCH, CALIBRATION_H_PATCH },
      ] = await loadModules()
      const adapter = await VitalPresetAdapter.fromUrl()
      const initialJson = adapter.exportPatch(CALIBRATION_A_PATCH).json
      const replacementJson = adapter.exportPatch(CALIBRATION_H_PATCH).json
      const sampleRate = 48_000
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate)
      const host = new VitalWorkletHost(context)
      const appliedRevisions: number[] = []
      const errors: Array<{ phase: string; message: string }> = []
      host.subscribe((event) => {
        if (event.type === 'state-applied') appliedRevisions.push(event.revision)
        if (event.type === 'error') errors.push({ phase: event.phase, message: event.message })
      })

      host.loadState(1, initialJson)
      host.setBpm(120)
      host.noteOn(60, 100 / 127)
      await host.prepare()

      const suspended = context.suspend(0.25)
      const rendering = context.startRendering()
      await suspended
      host.loadState(2, replacementJson)
      await new Promise((resolveMessageEvents) => setTimeout(resolveMessageEvents, 0))
      await context.resume()

      const buffer = await rendering
      await new Promise((resolveMessageEvents) => setTimeout(resolveMessageEvents, 0))
      host.dispose()

      const left = buffer.getChannelData(0)
      const right = buffer.getChannelData(1)
      let nonFiniteSamples = 0
      let peak = 0
      for (let frame = 0; frame < buffer.length; frame += 1) {
        const leftSample = left[frame]
        const rightSample = right[frame]
        if (!Number.isFinite(leftSample)) nonFiniteSamples += 1
        if (!Number.isFinite(rightSample)) nonFiniteSamples += 1
        if (Number.isFinite(leftSample)) peak = Math.max(peak, Math.abs(leftSample))
        if (Number.isFinite(rightSample)) peak = Math.max(peak, Math.abs(rightSample))
      }

      function rmsBetween(startSeconds: number, endSeconds: number): number {
        const startFrame = Math.round(startSeconds * sampleRate)
        const endFrame = Math.round(endSeconds * sampleRate)
        let sumSquares = 0
        for (let frame = startFrame; frame < endFrame; frame += 1) {
          sumSquares += left[frame] * left[frame] + right[frame] * right[frame]
        }
        return Math.sqrt(sumSquares / ((endFrame - startFrame) * 2))
      }

      let minTransitionBlockRms = Number.POSITIVE_INFINITY
      const transitionStartFrame = Math.round(0.24 * sampleRate)
      const transitionEndFrame = Math.round(0.46 * sampleRate)
      for (let blockStart = transitionStartFrame; blockStart < transitionEndFrame; blockStart += 128) {
        const blockEnd = Math.min(blockStart + 128, transitionEndFrame)
        let sumSquares = 0
        for (let frame = blockStart; frame < blockEnd; frame += 1) {
          sumSquares += left[frame] * left[frame] + right[frame] * right[frame]
        }
        minTransitionBlockRms = Math.min(
          minTransitionBlockRms,
          Math.sqrt(sumSquares / ((blockEnd - blockStart) * 2)),
        )
      }

      return {
        afterRms: rmsBetween(0.65, 0.95),
        appliedRevisions,
        beforeRms: rmsBetween(0.15, 0.23),
        errors,
        minTransitionBlockRms,
        nonFiniteSamples,
        peak,
      }
    })

    expect(result.errors).toEqual([])
    expect(result.appliedRevisions).toEqual([1, 2])
    expect(result.nonFiniteSamples).toBe(0)
    expect(result.peak).toBeGreaterThan(0)
    expect(result.peak).toBeLessThanOrEqual(1)
    expect(result.beforeRms).toBeGreaterThan(1e-3)
    expect(result.minTransitionBlockRms).toBeGreaterThan(1e-3)
    expect(result.afterRms).toBeGreaterThan(1e-3)
  })

  test('reports block telemetry from the exact development harness path', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__VITAL_HARNESS__ !== undefined)
    await page.evaluate(() => window.__VITAL_HARNESS__?.prepare())

    await page.mouse.click(1, 1)
    await page.evaluate(() => window.__VITAL_HARNESS__?.play(60))
    await page.waitForFunction(
      () => (window.__VITAL_HARNESS__?.getStats().renderStats.length ?? 0) > 0,
      undefined,
      { timeout: 15_000 },
    )
    await page.evaluate(() => window.__VITAL_HARNESS__?.loadCalibration('h'))
    await page.waitForFunction(
      () => window.__VITAL_HARNESS__?.getStats().appliedRevisions.includes(2) ?? false,
      undefined,
      { timeout: 15_000 },
    )

    const stats = await page.evaluate(() => window.__VITAL_HARNESS__?.getStats())
    await page.evaluate(async () => {
      await window.__VITAL_HARNESS__?.allNotesOff()
      await window.__VITAL_HARNESS__?.dispose()
    })

    expect(stats).toBeDefined()
    expect(stats?.contextState).toBe('running')
    expect(stats?.sampleRate).toBeGreaterThan(0)
    expect(stats?.appliedRevisions).toEqual([1, 2])
    expect(stats?.renderStats.length).toBeGreaterThan(0)
    expect(stats?.renderStats.at(-1)?.blockMs).toBeGreaterThanOrEqual(0)
    expect(stats?.renderStats.at(-1)?.overruns).toBeGreaterThanOrEqual(0)
    expect(stats?.errors).toEqual([])
  })
})
