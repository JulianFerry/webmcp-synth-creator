import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  getPatchPathValue,
  isSupportedPatchPath,
  parsePatchPathValue,
  setPatchPathValue,
  SUPPORTED_PATCH_PATHS,
} from '../../src/patch/paths'

describe('closed patch paths', () => {
  it('contains no duplicates and rejects invented semantic paths', () => {
    expect(new Set(SUPPORTED_PATCH_PATHS).size).toBe(SUPPORTED_PATCH_PATHS.length)
    expect(isSupportedPatchPath('filter.cutoffHz')).toBe(true)
    expect(isSupportedPatchPath('filter.warmth')).toBe(false)
    expect(isSupportedPatchPath('__proto__.polluted')).toBe(false)
  })

  it('reads, validates, and writes only a supported location', () => {
    const patch = createDefaultPatch()
    expect(getPatchPathValue(patch, 'filter.cutoffHz')).toBe(7200)
    const value = parsePatchPathValue('filter.cutoffHz', 3800)
    setPatchPathValue(patch, 'filter.cutoffHz', value)
    expect(patch.filter.cutoffHz).toBe(3800)
    expect(patch.oscillators[0].wavetablePosition).toBe(0.62)
  })

  it('keeps every supported path paired with a value schema', () => {
    const patch = createDefaultPatch()
    for (const path of SUPPORTED_PATCH_PATHS) {
      expect(() => parsePatchPathValue(path, getPatchPathValue(patch, path))).not.toThrow()
    }
  })
})
