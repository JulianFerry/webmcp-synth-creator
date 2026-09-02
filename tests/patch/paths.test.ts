import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  getPatchPathValue,
  isSupportedPatchPath,
  PATCH_PATH_REGISTRY,
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
    expect(Object.keys(PATCH_PATH_REGISTRY)).toEqual([...SUPPORTED_PATCH_PATHS])
    for (const path of SUPPORTED_PATCH_PATHS) {
      const metadata = PATCH_PATH_REGISTRY[path]
      expect(metadata.unit).not.toBe('')
      expect(metadata.validator).toBeDefined()
      expect(() => metadata.validator.parse(getPatchPathValue(patch, path))).not.toThrow()
      expect(() => parsePatchPathValue(path, getPatchPathValue(patch, path))).not.toThrow()
    }
  })

  it.each([
    ['seconds', ['ampEnvelope.attackSeconds', 'modEnvelope.releaseSeconds', 'voice.glideSeconds', 'effects.delay.timeSeconds', 'effects.reverb.predelay']],
    ['semitones', ['oscillators.0.transposeSemitones', 'oscillators.1.transposeSemitones', 'oscillators.2.transposeSemitones', 'voice.transposeSemitones']],
    ['cents', ['oscillators.0.fineTuneCents', 'oscillators.1.fineTuneCents', 'oscillators.2.fineTuneCents']],
    ['voice count', ['oscillators.0.unisonVoices', 'oscillators.1.unisonVoices', 'oscillators.2.unisonVoices', 'voice.polyphony', 'effects.chorus.voices']],
    ['enum', ['metadata.category', 'filter.type', 'effects.distortion.type', 'effects.delay.mode']],
    ['tempo division', ['effects.delay.division']],
    ['hertz', ['filter.cutoffHz']],
    ['dB/octave', ['filter.slope']],
  ] as const)('declares explicit %s units for its semantic path class', (unit, paths) => {
    for (const path of paths) {
      expect(PATCH_PATH_REGISTRY[path].unit).toBe(unit)
    }
  })

  it('labels every remaining normalized scalar explicitly', () => {
    const normalizedPaths = SUPPORTED_PATCH_PATHS.filter((path) =>
      PATCH_PATH_REGISTRY[path].unit === 'normalized 0..1')
    expect(normalizedPaths).toContain('oscillators.0.unisonDetune')
    expect(normalizedPaths).toContain('effects.chorus.rate')
    expect(normalizedPaths).toContain('effects.reverb.highCut')
  })
})
