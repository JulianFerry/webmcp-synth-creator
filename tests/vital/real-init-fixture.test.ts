import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { mapPhaseOneVitalParameters } from '../../src/vital/parameterMap'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

const fixturePath = resolve(process.cwd(), 'fixtures/vital/init.vital')
const hasLocalFixture = existsSync(fixturePath)

describe.skipIf(!hasLocalFixture)('locally supplied pinned Vital Init fixture', () => {
  it('contains every Phase 1 key and accepts the vertical-slice mapping', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      settings: Record<string, unknown>
      synth_version: string
    }
    const patch = createDefaultPatch()

    expect(fixture.synth_version).toBeTruthy()
    for (const key of Object.keys(mapPhaseOneVitalParameters(patch))) {
      expect(fixture.settings).toHaveProperty(key)
    }
    expect(() => new VitalPresetAdapter(fixture).exportPatch(patch)).not.toThrow()
  })
})
