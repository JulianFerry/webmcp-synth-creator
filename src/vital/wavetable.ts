import type { WavetableState } from '../patch/types'
import { renderWavetable, VITAL_FRAME_SAMPLE_COUNT } from '../wavetables/render'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    output += BASE64_ALPHABET[(chunk >> 18) & 63]
    output += BASE64_ALPHABET[(chunk >> 12) & 63]
    output += second === undefined ? '=' : BASE64_ALPHABET[(chunk >> 6) & 63]
    output += third === undefined ? '=' : BASE64_ALPHABET[chunk & 63]
  }
  return output
}

export function encodeFloat32LittleEndian(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * Float32Array.BYTES_PER_ELEMENT)
  const view = new DataView(buffer)
  samples.forEach((sample, index) => view.setFloat32(index * 4, sample, true))
  return bytesToBase64(new Uint8Array(buffer))
}

export interface VitalWavetable {
  author: string
  full_normalize: boolean
  groups: Array<{
    components: Array<{
      interpolation: number
      interpolation_style: number
      keyframes: Array<{ position: number; wave_data: string }>
      type: 'Wave Source'
    }>
  }>
  name: string
  remove_all_dc: boolean
  version: string
}

export function buildVitalWavetable(
  wavetable: WavetableState,
  version: string,
): VitalWavetable {
  const renderedFrames = renderWavetable(wavetable)
  const denominator = Math.max(1, renderedFrames.length - 1)
  const keyframes = renderedFrames.map((samples, index) => {
    if (samples.length !== VITAL_FRAME_SAMPLE_COUNT) {
      throw new Error(`Vital frame must contain ${VITAL_FRAME_SAMPLE_COUNT} samples`)
    }
    return {
      position: renderedFrames.length === 1 ? 0 : Math.round((index * 256) / denominator),
      wave_data: encodeFloat32LittleEndian(samples),
    }
  })

  return {
    author: 'Wavetable Workbench',
    full_normalize: true,
    groups: [
      {
        components: [
          {
            interpolation: 1,
            interpolation_style: 1,
            keyframes,
            type: 'Wave Source',
          },
        ],
      },
    ],
    name: wavetable.name,
    remove_all_dc: true,
    version,
  }
}
