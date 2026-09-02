import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { renderVitalOffline } from '../../src/audio/vital/offlineRender'
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
import { writeStereoWav } from './support/wav'

const artifact = findVitalArtifact()
const fixturePath = resolve(process.cwd(), 'fixtures/vital/init.vital')
const fixtureJson = readFileSync(fixturePath, 'utf8')
const fixture = JSON.parse(fixtureJson) as unknown
const adapter = new VitalPresetAdapter(fixture)

interface RenderCase {
  id: string
  patch?: PatchState
  stateJson?: string
}

const renderCases: RenderCase[] = [
  { id: 'init', stateJson: fixtureJson },
  { id: 'default', patch: createDefaultPatch() },
  { id: 'calibration-a', patch: CALIBRATION_A_PATCH },
  { id: 'calibration-b', patch: CALIBRATION_B_PATCH },
  { id: 'calibration-c', patch: CALIBRATION_C_PATCH },
  { id: 'calibration-d', patch: CALIBRATION_D_PATCH },
  { id: 'calibration-e', patch: CALIBRATION_E_PATCH },
  { id: 'calibration-f', patch: CALIBRATION_F_PATCH },
  { id: 'calibration-g', patch: CALIBRATION_G_PATCH },
  { id: 'calibration-h', patch: CALIBRATION_H_PATCH },
]

describe.skipIf(artifact === null)('Vital WASM preset loading', () => {
  it.each(renderCases)('loads and renders $id', async ({ id, patch, stateJson }) => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    const engine = await VitalEngine.create(imported.default, 48_000, {
      locateFile: (path) => resolve(dirname(artifact), path),
    })

    try {
      const json = patch ? vitalEnginePayload(adapter, patch) : stateJson
      if (json === undefined) throw new Error(`No Vital state supplied for ${id}`)
      expect(engine.loadState(json), `${id} state load`).toBe(true)

      const render = renderVitalOffline(engine)
      expect(render.metrics.nonFiniteSamples, `${id} non-finite samples`).toBe(0)
      expect(render.metrics.rms, `${id} RMS`).toBeGreaterThan(0)
      expect(render.metrics.peak, `${id} peak`).toBeLessThanOrEqual(1)
      expect(render.metrics.zeroCrossings, `${id} zero crossings`).toBeGreaterThan(0)
      expect(render.metrics.audibleBlocks, `${id} audible blocks`).toBeGreaterThan(0)
      expect(
        render.metrics.unexpectedSilentHoldBlocks,
        `${id} unexpected silent hold blocks`,
      ).toBe(0)

      writeStereoWav(resolve(process.cwd(), `test-results/vital-wasm/${id}.wav`), render)
      console.info(
        `[vital-wasm] ${id}: rms=${render.metrics.rms.toFixed(5)}, ` +
          `peak=${render.metrics.peak.toFixed(5)}, render=${render.metrics.renderDurationMs.toFixed(1)}ms`,
      )
    } finally {
      engine.dispose()
    }
  }, 60_000)
})
