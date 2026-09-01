import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { expect, test } from '@playwright/test'

const wasmPath = resolve(process.cwd(), 'wasm/vital/build/vital.wasm')
const modulePath = resolve(process.cwd(), 'wasm/vital/build/vital.mjs')
const artifactPresent = existsSync(wasmPath) && existsSync(modulePath)
const rawWasmBytes = artifactPresent ? statSync(wasmPath).size : 0
const gzipWasmBytes = artifactPresent ? gzipSync(readFileSync(wasmPath), { level: 9 }).byteLength : 0

test.describe('Vital browser performance', () => {
  test.skip(!artifactPresent, 'Vital WASM artifact is not built')

  test('records loading, steady audio, structural state, and scalar patch telemetry', async ({
    page,
  }) => {
    await page.route('**/', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Vital performance harness</body></html>',
      }),
    )
    await page.goto('/')
    await page.mouse.click(1, 1)

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
      const heavyPatch = structuredClone(CALIBRATION_H_PATCH)
      heavyPatch.voice.polyphony = 8
      for (const oscillator of heavyPatch.oscillators) {
        oscillator.enabled = true
        oscillator.unisonVoices = 8
        oscillator.unisonDetune = 0.6
        oscillator.stereoSpread = 1
      }
      const heavyJson = adapter.exportPatch(heavyPatch).json
      const cutoffPatch = structuredClone(heavyPatch)
      cutoffPatch.filter.cutoffHz = 2_400
      const cutoffOperations = adapter.controlOperations(heavyPatch, cutoffPatch)

      const context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48_000 })
      await context.resume()
      const host = new VitalWorkletHost(context)
      const errors: Array<{ phase: string; message: string }> = []
      const renderStats: Array<{
        averageBlockMs: number
        blockMs: number
        blocks: number
        overruns: number
      }> = []
      const stateEvents: Array<{ revision: number; durationMs: number; receivedAt: number }> = []
      const controlEvents: Array<{ revision: number; durationMs: number; receivedAt: number }> = []
      host.subscribe((event) => {
        if (event.type === 'error') errors.push({ phase: event.phase, message: event.message })
        if (event.type === 'render-stats') {
          renderStats.push({
            averageBlockMs: event.averageBlockMs,
            blockMs: event.blockMs,
            blocks: event.blocks,
            overruns: event.overruns,
          })
        }
        if (event.type === 'state-applied') {
          stateEvents.push({ ...event, receivedAt: performance.now() })
        }
        if (event.type === 'controls-applied') {
          controlEvents.push({ ...event, receivedAt: performance.now() })
        }
      })

      const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
        const deadline = performance.now() + 15_000
        while (!predicate()) {
          if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
          await new Promise((resolveWait) => setTimeout(resolveWait, 10))
        }
      }
      const waitForStats = async (additionalEvents: number): Promise<void> => {
        const target = renderStats.length + additionalEvents
        await waitFor(() => renderStats.length >= target, `${additionalEvents} render-stat events`)
      }
      const captureSteadyStats = async () => {
        await waitForStats(1)
        const baseline = renderStats.at(-1)?.overruns ?? 0
        const start = renderStats.length
        await waitForStats(2)
        const samples = renderStats.slice(start)
        const blocks = samples.reduce((sum, sample) => sum + sample.blocks, 0)
        const overrunDelta = (samples.at(-1)?.overruns ?? baseline) - baseline
        return {
          averageBlockMs:
            samples.reduce(
              (sum, sample) => sum + sample.averageBlockMs * sample.blocks,
              0,
            ) / blocks,
          blocks,
          maxBlockMs: Math.max(...samples.map((sample) => sample.blockMs)),
          overrunDelta,
          overrunRate: overrunDelta / blocks,
        }
      }

      host.loadState(1, initialJson)
      host.setBpm(120)
      const prepareStartedAt = performance.now()
      await host.prepare()
      const prepareMs = performance.now() - prepareStartedAt
      const navigationToReadyMs = performance.now()

      host.noteOn(60, 100 / 127)
      const oneVoice = await captureSteadyStats()
      host.allNotesOff()

      for (const note of [48, 50, 52, 53, 55, 57, 59, 60]) host.noteOn(note, 100 / 127)
      const eightVoices = await captureSteadyStats()
      host.allNotesOff()

      const stateRequestedAt = performance.now()
      host.loadState(2, heavyJson)
      await waitFor(
        () => stateEvents.some((event) => event.revision === 2),
        'heavy structural state revision',
      )
      const stateEvent = stateEvents.find((event) => event.revision === 2)!
      const structuralRoundTripMs = stateEvent.receivedAt - stateRequestedAt

      host.noteOn(60, 100 / 127)
      const unisonEffects = await captureSteadyStats()

      const controlRequestedAt = performance.now()
      host.setControls(3, cutoffOperations)
      await waitFor(
        () => controlEvents.some((event) => event.revision === 3),
        'scalar control revision',
      )
      const controlEvent = controlEvents.find((event) => event.revision === 3)!
      const scalarRoundTripMs = controlEvent.receivedAt - controlRequestedAt

      const resources = performance
        .getEntriesByType('resource')
        .filter((entry) =>
          entry.name.endsWith('/wasm/vital/build/vital.wasm'),
        ) as PerformanceResourceTiming[]
      const resource =
        resources.find((entry) => entry.decodedBodySize > 0) ?? resources.at(-1)
      const telemetry = {
        artifact: {
          decodedBodyBytes: resource?.decodedBodySize ?? 0,
          encodedBodyBytes: resource?.encodedBodySize ?? 0,
          transferBytes: resource?.transferSize ?? 0,
        },
        context: {
          baseLatencyMs: context.baseLatency * 1_000,
          outputLatencyMs:
            typeof context.outputLatency === 'number' ? context.outputLatency * 1_000 : null,
          quantumMs: (128 / context.sampleRate) * 1_000,
          sampleRate: context.sampleRate,
        },
        initialization: { navigationToReadyMs, prepareMs },
        oneVoice,
        eightVoices,
        unisonEffects,
        structuralState: {
          processorDurationMs: stateEvent.durationMs,
          roundTripMs: structuralRoundTripMs,
        },
        scalarPatch: {
          operationCount: cutoffOperations.length,
          processorDurationMs: controlEvent.durationMs,
          roundTripMs: scalarRoundTripMs,
        },
        errors,
      }
      host.allNotesOff()
      host.dispose()
      await context.close()
      return telemetry
    })

    const measurement = {
      wasm: { rawBytes: rawWasmBytes, gzipBytes: gzipWasmBytes },
      ...result,
    }
    console.info(`[vital-performance-browser] ${JSON.stringify(measurement)}`)

    expect(result.errors).toEqual([])
    expect(result.artifact.encodedBodyBytes).toBe(rawWasmBytes)
    expect(result.artifact.decodedBodyBytes).toBe(rawWasmBytes)
    expect(result.artifact.transferBytes).toBeGreaterThanOrEqual(rawWasmBytes)
    expect(rawWasmBytes).toBeLessThan(2_000_000)
    expect(gzipWasmBytes).toBeLessThan(500_000)
    expect(result.initialization.prepareMs).toBeLessThan(2_000)
    expect(result.initialization.navigationToReadyMs).toBeLessThan(5_000)
    // AudioWorklet performance.now() is quantized to 1 ms in this Chromium run. Keep at least 25%
    // average deadline headroom and allow one clock tick of max-duration uncertainty. The raw
    // overrun count remains telemetry: a measured 3 ms block cannot be classified reliably against
    // a 2.67 ms quantum with this clock resolution.
    expect(result.oneVoice.averageBlockMs).toBeLessThan(result.context.quantumMs * 0.75)
    expect(result.eightVoices.averageBlockMs).toBeLessThan(result.context.quantumMs * 0.75)
    expect(result.unisonEffects.averageBlockMs).toBeLessThan(result.context.quantumMs * 0.75)
    expect(result.oneVoice.maxBlockMs).toBeLessThanOrEqual(result.context.quantumMs + 1)
    expect(result.eightVoices.maxBlockMs).toBeLessThanOrEqual(result.context.quantumMs + 1)
    expect(result.unisonEffects.maxBlockMs).toBeLessThanOrEqual(result.context.quantumMs + 1)
    expect(result.structuralState.roundTripMs).toBeLessThan(1_000)
    expect(result.scalarPatch.operationCount).toBeGreaterThan(0)
    expect(result.scalarPatch.processorDurationMs).toBeLessThan(result.context.quantumMs)
    expect(result.scalarPatch.roundTripMs).toBeLessThan(50)
  })
})
