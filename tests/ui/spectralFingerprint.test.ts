import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  buildSpectralFingerprintSurface,
  SPECTRAL_FINGERPRINT_BANDS,
  SPECTRAL_FINGERPRINT_FRAMES,
  SPECTRAL_FINGERPRINT_ROTATION_DEGREES,
} from '../../src/ui/visualizations/spectralFingerprint'

describe('spectral fingerprint surface', () => {
  it('uses the requested 100-frame, 34-degree presentation', () => {
    const surface = buildSpectralFingerprintSurface(createDefaultPatch())

    expect(SPECTRAL_FINGERPRINT_ROTATION_DEGREES).toBe(34)
    expect(surface.frames).toBe(SPECTRAL_FINGERPRINT_FRAMES)
    expect(surface.frames).toBe(100)
    expect(surface.bands).toBe(SPECTRAL_FINGERPRINT_BANDS)
    expect(surface.magnitudes).toHaveLength(SPECTRAL_FINGERPRINT_FRAMES * SPECTRAL_FINGERPRINT_BANDS)
    expect(Math.max(...surface.magnitudes)).toBeCloseTo(1, 5)
    expect([...surface.magnitudes].every((magnitude) => magnitude >= 0 && magnitude <= 1)).toBe(true)
  })

  it('is deterministic and responds to spectral patch changes', () => {
    const patch = createDefaultPatch()
    const first = buildSpectralFingerprintSurface(patch)
    const repeated = buildSpectralFingerprintSurface(patch)
    const darkerPatch = structuredClone(patch)
    darkerPatch.filter.cutoffHz = 320
    const darker = buildSpectralFingerprintSurface(darkerPatch)

    expect(first.magnitudes).toEqual(repeated.magnitudes)
    expect(first.magnitudes).not.toEqual(darker.magnitudes)
  })
})
