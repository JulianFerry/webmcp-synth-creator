import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { createDefaultPatch } from '../../src/patch/defaults'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()

describe.skipIf(artifact === null)('Vital WASM scalar controls', () => {
  it('applies adapter-derived controls within one render-quantum budget', async () => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    const engine = await VitalEngine.create(imported.default, 48_000, {
      locateFile: (path) => resolve(dirname(artifact), path),
    })
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as unknown
    const adapter = new VitalPresetAdapter(fixture)
    const before = createDefaultPatch()
    const after = structuredClone(before)
    after.filter.cutoffHz = 2_400
    const operation = adapter
      .controlOperations(before, after)
      .find((candidate) => candidate.name === 'filter_fx_cutoff')

    try {
      expect(operation).toBeDefined()
      expect(engine.loadState(adapter.exportPatch(before).json)).toBe(true)
      const startedAt = performance.now()
      for (let index = 0; index < 256; index += 1) {
        const value = index % 2 === 0 ? operation!.value : operation!.value + 1
        expect(engine.setControl(operation!.name, value)).toBe(true)
      }
      const averageDurationMs = (performance.now() - startedAt) / 256
      expect(averageDurationMs).toBeLessThan((128 / 48_000) * 1_000)
      expect(engine.setControl('not_a_vital_control', 0)).toBe(false)
    } finally {
      engine.dispose()
    }
  }, 60_000)
})
