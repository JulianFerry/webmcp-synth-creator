import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface StereoWav {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

export function writeStereoWav(path: string, audio: StereoWav): void {
  if (audio.left.length !== audio.right.length) {
    throw new RangeError('WAV channel lengths must match')
  }

  const channels = 2
  const bytesPerSample = 2
  const dataBytes = audio.left.length * channels * bytesPerSample
  const output = Buffer.alloc(44 + dataBytes)

  output.write('RIFF', 0)
  output.writeUInt32LE(36 + dataBytes, 4)
  output.write('WAVE', 8)
  output.write('fmt ', 12)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(channels, 22)
  output.writeUInt32LE(audio.sampleRate, 24)
  output.writeUInt32LE(audio.sampleRate * channels * bytesPerSample, 28)
  output.writeUInt16LE(channels * bytesPerSample, 32)
  output.writeUInt16LE(bytesPerSample * 8, 34)
  output.write('data', 36)
  output.writeUInt32LE(dataBytes, 40)

  for (let frame = 0; frame < audio.left.length; frame += 1) {
    output.writeInt16LE(toPcm16(audio.left[frame]), 44 + frame * 4)
    output.writeInt16LE(toPcm16(audio.right[frame]), 46 + frame * 4)
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, output)
}

function toPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 32_768 : clamped * 32_767)
}
