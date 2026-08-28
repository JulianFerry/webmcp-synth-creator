import type { PatchState } from '../patch/types'
import { resolveWavetable } from '../wavetables/registry'
import { scheduleEnvelopeAttack, scheduleEnvelopeRelease } from './envelope'
import { applyFilterState } from './filter'
import { transposeFrequency, velocityToGain } from './units'
import { WavetableVoiceOscillator } from './WavetableVoiceOscillator'

export interface OfflineVoiceMetrics {
  rms: number
  tailRms: number
  activeDurationSeconds: number
  zeroCrossingHz: number
  highFrequencyEnergy: number
}

export interface OfflineRenderOptions {
  midi?: number
  velocity?: number
  noteOffSeconds?: number
  durationSeconds?: number
  sampleRate?: number
}

function analyzeBuffer(buffer: AudioBuffer): OfflineVoiceMetrics {
  const sampleRate = buffer.sampleRate
  const samples = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < data.length; index += 1) {
      samples[index] += data[index] / buffer.numberOfChannels
    }
  }

  let squared = 0
  let differenceSquared = 0
  let peak = 0
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    squared += sample * sample
    peak = Math.max(peak, Math.abs(sample))
    if (index > 0) {
      const difference = sample - samples[index - 1]
      differenceSquared += difference * difference
    }
  }

  const tailStart = Math.floor(samples.length * 0.75)
  let tailSquared = 0
  for (let index = tailStart; index < samples.length; index += 1) {
    tailSquared += samples[index] * samples[index]
  }

  let lastActiveSample = 0
  const activityThreshold = peak * 0.01
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (Math.abs(samples[index]) >= activityThreshold) {
      lastActiveSample = index
      break
    }
  }

  const crossingStart = Math.floor(sampleRate * 0.1)
  const crossingEnd = Math.min(samples.length, Math.floor(sampleRate * 0.35))
  let crossings = 0
  for (let index = crossingStart + 1; index < crossingEnd; index += 1) {
    if (
      (samples[index - 1] < 0 && samples[index] >= 0) ||
      (samples[index - 1] >= 0 && samples[index] < 0)
    ) {
      crossings += 1
    }
  }
  const crossingDuration = Math.max(1 / sampleRate, (crossingEnd - crossingStart) / sampleRate)

  return {
    rms: Math.sqrt(squared / samples.length),
    tailRms: Math.sqrt(tailSquared / Math.max(1, samples.length - tailStart)),
    activeDurationSeconds: peak === 0 ? 0 : lastActiveSample / sampleRate,
    zeroCrossingHz: crossings / (2 * crossingDuration),
    highFrequencyEnergy: squared === 0 ? 0 : differenceSquared / squared,
  }
}

export async function renderOfflineVoice(
  patch: PatchState,
  options: OfflineRenderOptions = {},
): Promise<OfflineVoiceMetrics> {
  const sampleRate = options.sampleRate ?? 24_000
  const durationSeconds = options.durationSeconds ?? 1
  const noteOffSeconds = options.noteOffSeconds ?? 0.35
  const midi = options.midi ?? 60
  const velocity = options.velocity ?? 0.85
  const context = new OfflineAudioContext(
    2,
    Math.ceil(durationSeconds * sampleRate),
    sampleRate,
  )
  const filter = context.createBiquadFilter()
  const amplitude = context.createGain()
  filter.connect(amplitude).connect(context.destination)

  const oscillators = patch.oscillators.map((oscillator) => {
    const voice = new WavetableVoiceOscillator(
      context,
      resolveWavetable(patch.wavetableData, oscillator.wavetableId),
      {
        voices: oscillator.unisonVoices,
        detune: oscillator.unisonDetune,
        stereoSpread: oscillator.stereoSpread,
      },
    )
    const level = context.createGain()
    level.gain.setValueAtTime(
      oscillator.enabled
        ? oscillator.level * velocityToGain(velocity, patch.voice.velocitySensitivity) * 0.24
        : 0,
      0,
    )
    voice.connect(level)
    level.connect(filter)
    voice.setPositionAtTime(oscillator.wavetablePosition, 0)
    voice.setFrequencyAtTime(
      transposeFrequency(midi, oscillator.transposeSemitones, oscillator.fineTuneCents),
      0,
    )
    return voice
  })

  applyFilterState(filter, patch.filter, 0)
  scheduleEnvelopeAttack(amplitude.gain, patch.ampEnvelope, 0)
  const releaseEnd = scheduleEnvelopeRelease(
    amplitude.gain,
    patch.ampEnvelope.releaseSeconds,
    noteOffSeconds,
  )
  oscillators.forEach((oscillator) => oscillator.dispose(releaseEnd + 0.005))

  return analyzeBuffer(await context.startRendering())
}
