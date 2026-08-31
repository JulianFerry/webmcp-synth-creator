import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { vitalEnginePayload } from '../../src/audio/vital/state'
import {
  CALIBRATION_A_PATCH,
  CALIBRATION_D_PATCH,
  CALIBRATION_H_PATCH,
} from '../../src/presets/patches/calibration'
import type { PatchState } from '../../src/patch/types'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()
const sampleRate = 48_000
const quantumMs = (128 / sampleRate) * 1_000
const adapter = new VitalPresetAdapter(
  JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')) as unknown,
)
let factory: VitalWasmModuleFactory

interface BlockCost {
  averageMs: number
  maxMs: number
  p95Ms: number
}

describe.skipIf(artifact === null)('Vital WASM performance matrix', () => {
  beforeAll(async () => {
    if (artifact === null) return
    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    factory = imported.default
  })

  it('keeps state loads within the recorded structural-load envelope', async () => {
    const engine = await createEngine()
    try {
      const loadMs = {
        a: measure(() => expect(engine.loadState(vitalEnginePayload(adapter, CALIBRATION_A_PATCH))).toBe(true)),
        d: measure(() => expect(engine.loadState(vitalEnginePayload(adapter, CALIBRATION_D_PATCH))).toBe(true)),
        h: measure(() => expect(engine.loadState(vitalEnginePayload(adapter, CALIBRATION_H_PATCH))).toBe(true)),
      }
      const cutoffOperation = adapter
        .controlOperations(CALIBRATION_H_PATCH, withCutoff(CALIBRATION_H_PATCH, 2_400))
        .find((operation) => operation.name === 'filter_1_cutoff')
      expect(cutoffOperation).toBeDefined()
      const controlStartedAt = performance.now()
      for (let index = 0; index < 512; index += 1) {
        expect(
          engine.setControl(
            cutoffOperation!.name,
            cutoffOperation!.value + (index % 2 === 0 ? 0 : 0.01),
          ),
        ).toBe(true)
      }
      const controlAverageMs = (performance.now() - controlStartedAt) / 512
      // The browser spec owns the realtime deadline gate. These Node wall-clock values retain the
      // structural/scalar cost contrast and expose large regressions without pretending a parallel
      // Vitest worker has an AudioWorklet deadline.
      const measurement = { loadMs, controlAverageMs }
      console.info(`[vital-performance] state=${JSON.stringify(measurement)}`)
      writeMeasurement('state-load.json', measurement)

      // Full state loading is structural-only and incrementally scheduled in the realtime host.
      // The broad wall-clock ceiling tolerates worker contention; the scalar/full-load ratio is
      // the meaningful regression boundary here.
      expect(Math.max(...Object.values(loadMs))).toBeLessThan(5_000)
      expect(controlAverageMs).toBeLessThan(Math.min(...Object.values(loadMs)) / 100)
    } finally {
      engine.dispose()
    }
  }, 120_000)

  it('records one voice, eight voices, and a unison/effects stress patch', async () => {
    const heavy = structuredClone(CALIBRATION_H_PATCH)
    heavy.voice.polyphony = 8
    for (const oscillator of heavy.oscillators) {
      oscillator.enabled = true
      oscillator.unisonVoices = 8
      oscillator.unisonDetune = 0.6
      oscillator.stereoSpread = 1
    }

    const costs = {
      oneVoice: await measureBlockCost(CALIBRATION_A_PATCH, [60]),
      eightVoices: await measureBlockCost(CALIBRATION_A_PATCH, [48, 50, 52, 53, 55, 57, 59, 60]),
      unisonEffects: await measureBlockCost(heavy, [60]),
    }
    console.info(`[vital-performance] blocks=${JSON.stringify({ quantumMs, ...costs })}`)
    writeMeasurement('block-cost.json', { quantumMs, ...costs })

    for (const cost of Object.values(costs)) {
      expect(cost.averageMs).toBeGreaterThan(0)
      expect(cost.p95Ms).toBeLessThan(100)
    }
    expect(costs.oneVoice.averageMs).toBeLessThan(costs.eightVoices.averageMs)
    expect(costs.oneVoice.averageMs).toBeLessThan(costs.unisonEffects.averageMs)
  }, 120_000)
})

async function createEngine(): Promise<VitalEngine> {
  if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')
  return VitalEngine.create(factory, sampleRate, {
    locateFile: (path) => resolve(dirname(artifact), path),
  })
}

async function measureBlockCost(patch: PatchState, notes: number[]): Promise<BlockCost> {
  const engine = await createEngine()
  try {
    expect(engine.loadState(vitalEnginePayload(adapter, patch))).toBe(true)
    engine.setBpm(120)
    for (const note of notes) engine.noteOn(note, 100 / 127)
    for (let block = 0; block < 64; block += 1) engine.process(128)

    const durations: number[] = []
    for (let block = 0; block < 512; block += 1) {
      const startedAt = performance.now()
      engine.process(128)
      durations.push(performance.now() - startedAt)
    }
    durations.sort((left, right) => left - right)
    return {
      averageMs: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
      maxMs: durations.at(-1) ?? 0,
      p95Ms: durations[Math.floor(durations.length * 0.95)],
    }
  } finally {
    engine.dispose()
  }
}

function withCutoff(patch: PatchState, cutoffHz: number): PatchState {
  const result = structuredClone(patch)
  result.filter.cutoffHz = cutoffHz
  return result
}

function measure(operation: () => void): number {
  const startedAt = performance.now()
  operation()
  return performance.now() - startedAt
}

function writeMeasurement(filename: string, value: unknown): void {
  const directory = resolve(process.cwd(), 'test-results/vital-performance')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, filename), `${JSON.stringify(value, null, 2)}\n`)
}
