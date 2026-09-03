import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import {
  buildSpectralFingerprintSurface,
  SPECTRAL_FINGERPRINT_BANDS,
  SPECTRAL_FINGERPRINT_DURATION_SECONDS,
  SPECTRAL_FINGERPRINT_FRAMES,
  SPECTRAL_FINGERPRINT_NOTE_PRESS_SECONDS,
  SPECTRAL_FINGERPRINT_ROTATION_DEGREES,
} from '../../src/ui/visualizations/spectralFingerprint'

describe('spectral fingerprint surface', () => {
  it('uses a one-second note press followed by one second of release', () => {
    const surface = buildSpectralFingerprintSurface(createDefaultPatch())

    expect(SPECTRAL_FINGERPRINT_ROTATION_DEGREES).toBe(34)
    expect(SPECTRAL_FINGERPRINT_DURATION_SECONDS).toBe(2)
    expect(SPECTRAL_FINGERPRINT_NOTE_PRESS_SECONDS).toBe(1)
    expect(surface.durationSeconds).toBe(2)
    expect(surface.frames).toBe(SPECTRAL_FINGERPRINT_FRAMES)
    expect(surface.frames).toBe(100)
    expect(surface.bands).toBe(SPECTRAL_FINGERPRINT_BANDS)
    expect(surface.magnitudes).toHaveLength(SPECTRAL_FINGERPRINT_FRAMES * SPECTRAL_FINGERPRINT_BANDS)
    expect(Math.max(...surface.magnitudes)).toBeCloseTo(1, 5)
    expect([...surface.magnitudes].every((magnitude) => magnitude >= 0 && magnitude <= 1)).toBe(true)

    const heldFramePeak = Math.max(...surface.magnitudes.slice(49 * surface.bands, 50 * surface.bands))
    const releaseFramePeak = Math.max(...surface.magnitudes.slice(99 * surface.bands, 100 * surface.bands))
    expect(releaseFramePeak).toBeLessThan(heldFramePeak)
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
