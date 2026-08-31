import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { vitalEnginePayload } from '../../src/audio/vital/state'
import {
  CALIBRATION_A_PATCH,
  CALIBRATION_B_PATCH,
  CALIBRATION_D_PATCH,
  CALIBRATION_F_PATCH,
  CALIBRATION_H_PATCH,
} from '../../src/presets/patches/calibration'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()
const fixtureJson = readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')
const adapter = new VitalPresetAdapter(JSON.parse(fixtureJson) as unknown)

const FRAMES_PER_STEP = 4

async function createEngine(path: string): Promise<VitalEngine> {
  const imported = (await import(pathToFileURL(path).href)) as { default: VitalWasmModuleFactory }
  return VitalEngine.create(imported.default, 48_000, {
    locateFile: (file) => resolve(dirname(path), file),
  })
}

function renderProbe(engine: VitalEngine, blocks: number): number[] {
  const left = new Float32Array(128)
  const right = new Float32Array(128)
  const probe: number[] = []
  for (let block = 0; block < blocks; block += 1) {
    engine.process(128)
    engine.copyStereoTo(left, right, 128)
    probe.push(left[0], left[37], left[127], right[0], right[37], right[127])
  }
  return probe
}

function loadIncrementally(engine: VitalEngine, json: string): void {
  expect(engine.beginLoadState(json)).toBe(true)
  let remaining = 1
  let steps = 0
  while (remaining > 0) {
    remaining = engine.stepLoadState(FRAMES_PER_STEP)
    expect(remaining).toBeGreaterThanOrEqual(0)
    steps += 1
    expect(steps).toBeLessThan(5_000)
  }
  expect(engine.finishLoadState()).toBe(true)
}

// The worklet spreads state loading across render quanta so that no single call blows the audio
// deadline. That is only safe while it stays exactly equivalent to the one-shot load, which is
// also what the offline renderer and the .vital download describe.
describe.skipIf(artifact === null)('Vital incremental state load', () => {
  it('matches the monolithic load sample for sample across the calibration ladder', async () => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const monolithic = await createEngine(artifact)
    const incremental = await createEngine(artifact)
    const ladder = [
      CALIBRATION_A_PATCH,
      CALIBRATION_H_PATCH,
      CALIBRATION_D_PATCH,
      CALIBRATION_B_PATCH,
      CALIBRATION_F_PATCH,
      CALIBRATION_H_PATCH,
      CALIBRATION_A_PATCH,
    ]

    for (const patch of ladder) {
      const json = vitalEnginePayload(adapter, patch)
      expect(monolithic.loadState(json)).toBe(true)
      loadIncrementally(incremental, json)

      monolithic.setBpm(120)
      incremental.setBpm(120)
      monolithic.noteOn(60, 100 / 127)
      incremental.noteOn(60, 100 / 127)
      expect(renderProbe(incremental, 60)).toEqual(renderProbe(monolithic, 60))

      monolithic.noteOff(60)
      incremental.noteOff(60)
      expect(renderProbe(incremental, 30)).toEqual(renderProbe(monolithic, 30))

      monolithic.allNotesOff()
      incremental.allNotesOff()
      renderProbe(monolithic, 10)
      renderProbe(incremental, 10)
    }

    monolithic.dispose()
    incremental.dispose()
  }, 180_000)

  it('reports the outstanding frame count and rejects an empty payload', async () => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const engine = await createEngine(artifact)
    expect(() => engine.beginLoadState('')).toThrow(RangeError)
    expect(() => engine.stepLoadState(Number.MAX_SAFE_INTEGER)).toThrow(RangeError)
    expect(engine.stepLoadState(FRAMES_PER_STEP)).toBe(-1)
    expect(engine.finishLoadState()).toBe(false)

    // Calibration H spans wavetable positions 0..256, so it costs far more than one frame.
    expect(engine.beginLoadState(vitalEnginePayload(adapter, CALIBRATION_H_PATCH))).toBe(true)
    expect(engine.stepLoadState(FRAMES_PER_STEP)).toBeGreaterThan(200)
    expect(engine.finishLoadState()).toBe(true)
    expect(engine.stepLoadState(FRAMES_PER_STEP)).toBe(-1)

    engine.dispose()
  }, 60_000)
})
