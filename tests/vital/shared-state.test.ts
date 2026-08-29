import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { vitalEnginePayload } from '../../src/audio/vital/state'
import { createDefaultPatch } from '../../src/patch/defaults'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared Vital state', () => {
  it('uses the exact deterministic export body for engine loading and download', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
    ) as unknown
    const adapter = new VitalPresetAdapter(fixture)
    const patch = createDefaultPatch()
    const exported = adapter.exportPatch(patch)
    let downloadedBlob: Blob | undefined
    const anchor = { click: vi.fn(), download: '', href: '' }
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('document', { createElement: () => anchor })
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        downloadedBlob = blob
        return 'blob:vital-state'
      },
      revokeObjectURL,
    })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      },
    })

    const downloadedFilename = adapter.downloadPatch(patch)

    expect(adapter.exportPatch(patch).json).toBe(exported.json)
    expect(vitalEnginePayload(adapter, patch)).toBe(exported.json)
    expect(await downloadedBlob?.text()).toBe(exported.json)
    expect(downloadedFilename).toBe(exported.filename)
    expect(anchor.download).toBe(exported.filename)
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:vital-state')
  })
})
