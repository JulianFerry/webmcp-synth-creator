import { describe, expect, it } from 'vitest'

import { createDefaultPatch } from '../../src/patch/defaults'
import { VITAL_FRAME_SAMPLE_COUNT } from '../../src/wavetables/render'
import {
  buildVitalWavetable,
  encodeFloat32LittleEndian,
} from '../../src/vital/wavetable'

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

describe('Vital wavetable encoding', () => {
  it('encodes deterministic little-endian float32 samples', () => {
    const samples = new Float32Array([1, -0.5, 0.25])
    const first = encodeFloat32LittleEndian(samples)
    const second = encodeFloat32LittleEndian(samples)
    expect(first).toBe(second)

    const bytes = decodeBase64(first)
    expect(bytes).toHaveLength(12)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getFloat32(0, true)).toBe(1)
    expect(view.getFloat32(4, true)).toBe(-0.5)
    expect(view.getFloat32(8, true)).toBe(0.25)
  })

  it('builds positioned 2,048-float keyframes for each generated frame', () => {
    const airy = createDefaultPatch().wavetableData.airy
    const first = buildVitalWavetable(airy, 'fixture-version')
    const second = buildVitalWavetable(airy, 'fixture-version')
    const keyframes = first.groups[0].components[0].keyframes

    expect(first).toEqual(second)
    expect(first.version).toBe('fixture-version')
    expect(keyframes.map(({ position }) => position)).toEqual([0, 128, 256])
    for (const keyframe of keyframes) {
      expect(decodeBase64(keyframe.wave_data)).toHaveLength(
        VITAL_FRAME_SAMPLE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      )
    }
  })
})
