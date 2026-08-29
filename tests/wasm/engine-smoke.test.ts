import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { renderVitalOffline } from '../../src/audio/vital/offlineRender'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()

describe.skipIf(artifact === null)('Vital WASM engine', () => {
  it('constructs, renders C4, and destroys an engine at 48 kHz', async () => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    const engine = await VitalEngine.create(imported.default, 48_000, {
      locateFile: (path) => resolve(dirname(artifact), path),
    })

    expect(engine.isDisposed).toBe(false)
    const render = renderVitalOffline(engine, { holdSeconds: 1, tailSeconds: 0.5 })
    expect(render.metrics.nonFiniteSamples).toBe(0)
    expect(render.metrics.rms).toBeGreaterThan(0)
    expect(render.metrics.peak).toBeLessThanOrEqual(1)
    expect(render.metrics.zeroCrossings).toBeGreaterThan(0)
    expect(render.metrics.audibleBlocks).toBeGreaterThan(0)
    expect(render.metrics.unexpectedSilentHoldBlocks).toBe(0)

    engine.dispose()
    expect(engine.isDisposed).toBe(true)
  }, 60_000)
})
