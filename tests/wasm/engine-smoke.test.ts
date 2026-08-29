import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import { findVitalArtifact } from './support/artifact'

const artifact = findVitalArtifact()

describe.skipIf(artifact === null)('Vital WASM engine', () => {
  it('constructs and destroys an engine at 48 kHz', async () => {
    if (artifact === null) throw new Error('Vital WASM artifact disappeared during the test')

    const imported = (await import(pathToFileURL(artifact).href)) as {
      default: VitalWasmModuleFactory
    }
    const engine = await VitalEngine.create(imported.default, 48_000, {
      locateFile: (path) => resolve(dirname(artifact), path),
    })

    expect(engine.isDisposed).toBe(false)
    engine.dispose()
    expect(engine.isDisposed).toBe(true)
  })
})
