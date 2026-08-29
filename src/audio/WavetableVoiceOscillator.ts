import type { WavetableState } from '../patch/types'
import { toPeriodicWaveCoefficients } from '../wavetables/render'
import { createUnisonPlacements } from './units'

type WavetableAudioContext = AudioContext | OfflineAudioContext

let nextPhaseSeed = 0

function deterministicPhase(seed: number, lane: number): number {
  let value = Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(lane + 1, 0x85ebca6b)
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  return (value >>> 0) / 0x1_0000_0000
}

export function rotatePeriodicWaveCoefficients(
  real: Float32Array,
  imag: Float32Array,
  phaseCycles: number,
): { real: Float32Array; imag: Float32Array } {
  if (real.length !== imag.length) {
    throw new RangeError('Periodic-wave coefficient arrays must have the same length')
  }
  const rotatedReal = new Float32Array(real.length)
  const rotatedImag = new Float32Array(imag.length)
  for (let harmonic = 0; harmonic < real.length; harmonic += 1) {
    const phase = 2 * Math.PI * phaseCycles * harmonic
    const cosine = Math.cos(phase)
    const sine = Math.sin(phase)
    rotatedReal[harmonic] = real[harmonic] * cosine + imag[harmonic] * sine
    rotatedImag[harmonic] = imag[harmonic] * cosine - real[harmonic] * sine
  }
  return { real: rotatedReal, imag: rotatedImag }
}

export interface UnisonConfiguration {
  voices: number
  detune: number
  stereoSpread: number
  randomPhase: number
}

interface UnisonLane {
  oscillatorA: OscillatorNode
  oscillatorB: OscillatorNode
  gainA: GainNode
  gainB: GainNode
  laneGain: GainNode
  panner: StereoPannerNode
  waves: PeriodicWave[]
}

interface UnisonGroup {
  lanes: UnisonLane[]
  output: GainNode
}

export class WavetableVoiceOscillator {
  private readonly phaseSeed = nextPhaseSeed++
  private readonly output: GainNode
  private wavetable: WavetableState
  private group: UnisonGroup
  private unison: UnisonConfiguration
  private frequencyHz = 440
  private position = 0
  private disposed = false

  constructor(
    private readonly context: WavetableAudioContext,
    wavetable: WavetableState,
    unison: UnisonConfiguration = {
      voices: 1,
      detune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    },
  ) {
    this.output = context.createGain()
    this.wavetable = structuredClone(wavetable)
    this.unison = { ...unison }
    this.group = this.createGroup(this.unison, context.currentTime)
    this.group.output.connect(this.output)
    this.applyPosition(this.group, this.position, context.currentTime)
    this.applyFrequency(this.group, this.frequencyHz, context.currentTime)
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  setWavetable(wavetable: WavetableState): void {
    this.ensureActive()
    this.wavetable = structuredClone(wavetable)
    this.replaceGroupAtTime(this.unison, this.context.currentTime)
  }

  setPositionAtTime(position: number, time: number): void {
    this.ensureActive()
    this.position = Math.max(0, Math.min(1, position))
    this.applyPosition(this.group, this.position, time)
  }

  setFrequencyAtTime(
    hz: number,
    time: number,
    glideSeconds = 0,
    startFrequencyHz?: number,
  ): void {
    this.ensureActive()
    const target = Math.max(1, hz)
    this.applyFrequency(this.group, target, time, glideSeconds, startFrequencyHz)
    this.frequencyHz = target
  }

  scheduleFrequencyAtTime(hz: number, time: number): void {
    this.ensureActive()
    const target = Math.max(1, hz)
    this.group.lanes.forEach((lane) => {
      lane.oscillatorA.frequency.linearRampToValueAtTime(target, time)
      lane.oscillatorB.frequency.linearRampToValueAtTime(target, time)
    })
    this.frequencyHz = target
  }

  setUnisonAtTime(unison: UnisonConfiguration, time: number): void {
    this.ensureActive()
    if (
      this.unison.voices === unison.voices &&
      this.unison.detune === unison.detune &&
      this.unison.stereoSpread === unison.stereoSpread &&
      this.unison.randomPhase === unison.randomPhase
    ) {
      return
    }

    if (
      this.unison.voices === unison.voices &&
      this.unison.randomPhase === unison.randomPhase
    ) {
      this.applyUnisonPlacements(this.group, unison, time)
    } else {
      this.replaceGroupAtTime(unison, time)
    }
    this.unison = { ...unison }
  }

  dispose(time = this.context.currentTime): void {
    if (this.disposed) return
    this.disposed = true
    this.output.gain.cancelScheduledValues(time)
    this.output.gain.setValueAtTime(this.output.gain.value, time)
    this.output.gain.linearRampToValueAtTime(0, time + 0.02)
    this.stopGroup(this.group, time + 0.03)
  }

  private createWaves(phaseCycles: number): PeriodicWave[] {
    return this.wavetable.frames.map((frame) => {
      const { real, imag } = toPeriodicWaveCoefficients(frame)
      const rotated = rotatePeriodicWaveCoefficients(real, imag, phaseCycles)
      return this.context.createPeriodicWave(rotated.real, rotated.imag, {
        disableNormalization: false,
      })
    })
  }

  private createGroup(
    unison: UnisonConfiguration,
    startTime: number,
    initialGain = 1,
  ): UnisonGroup {
    const output = this.context.createGain()
    output.gain.setValueAtTime(initialGain, startTime)
    const placements = createUnisonPlacements(unison.voices, unison.detune, unison.stereoSpread)
    const lanes = placements.map((placement, laneIndex) => {
      const oscillatorA = this.context.createOscillator()
      const oscillatorB = this.context.createOscillator()
      const gainA = this.context.createGain()
      const gainB = this.context.createGain()
      const laneGain = this.context.createGain()
      const panner = this.context.createStereoPanner()
      const phaseCycles = deterministicPhase(this.phaseSeed, laneIndex) * unison.randomPhase
      const waves = this.createWaves(phaseCycles)

      laneGain.gain.setValueAtTime(placement.gain, startTime)
      panner.pan.setValueAtTime(placement.pan, startTime)
      oscillatorA.detune.setValueAtTime(placement.detuneCents, startTime)
      oscillatorB.detune.setValueAtTime(placement.detuneCents, startTime)
      oscillatorA.connect(gainA).connect(laneGain)
      oscillatorB.connect(gainB).connect(laneGain)
      laneGain.connect(panner).connect(output)
      oscillatorA.start(startTime)
      oscillatorB.start(startTime)

      return { oscillatorA, oscillatorB, gainA, gainB, laneGain, panner, waves }
    })
    return { lanes, output }
  }

  private applyPosition(group: UnisonGroup, position: number, time: number): void {
    const waveCount = group.lanes[0]?.waves.length ?? 0
    if (waveCount === 0) return
    const framePosition = position * Math.max(0, waveCount - 1)
    const lowerIndex = Math.floor(framePosition)
    const upperIndex = Math.min(waveCount - 1, lowerIndex + 1)
    const mix = framePosition - lowerIndex

    group.lanes.forEach((lane) => {
      lane.oscillatorA.setPeriodicWave(lane.waves[lowerIndex])
      lane.oscillatorB.setPeriodicWave(lane.waves[upperIndex])
      lane.gainA.gain.setValueAtTime(1 - mix, time)
      lane.gainB.gain.setValueAtTime(mix, time)
    })
  }

  private applyFrequency(
    group: UnisonGroup,
    frequencyHz: number,
    time: number,
    glideSeconds = 0,
    startFrequencyHz?: number,
  ): void {
    group.lanes.forEach((lane) => {
      for (const parameter of [lane.oscillatorA.frequency, lane.oscillatorB.frequency]) {
        parameter.cancelScheduledValues(time)
        if (glideSeconds > 0) {
          const start = Math.max(1, startFrequencyHz ?? parameter.value)
          parameter.setValueAtTime(start, time)
          parameter.exponentialRampToValueAtTime(frequencyHz, time + glideSeconds)
        } else {
          parameter.setValueAtTime(frequencyHz, time)
        }
      }
    })
  }

  private applyUnisonPlacements(
    group: UnisonGroup,
    unison: UnisonConfiguration,
    time: number,
  ): void {
    const placements = createUnisonPlacements(
      unison.voices,
      unison.detune,
      unison.stereoSpread,
    )
    group.lanes.forEach((lane, index) => {
      const placement = placements[index]
      this.smoothAudioParam(lane.oscillatorA.detune, placement.detuneCents, time)
      this.smoothAudioParam(lane.oscillatorB.detune, placement.detuneCents, time)
      this.smoothAudioParam(lane.panner.pan, placement.pan, time)
      this.smoothAudioParam(lane.laneGain.gain, placement.gain, time)
    })
  }

  private replaceGroupAtTime(unison: UnisonConfiguration, time: number): void {
    const previous = this.group
    const next = this.createGroup(unison, time, 0)
    next.output.connect(this.output)
    this.applyPosition(next, this.position, time)
    this.applyFrequency(next, this.frequencyHz, time)
    next.output.gain.linearRampToValueAtTime(1, time + 0.02)

    this.holdAudioParam(previous.output.gain, time)
    previous.output.gain.linearRampToValueAtTime(0, time + 0.02)
    this.stopGroup(previous, time + 0.03)
    this.group = next
  }

  private smoothAudioParam(parameter: AudioParam, value: number, time: number): void {
    this.holdAudioParam(parameter, time)
    parameter.linearRampToValueAtTime(value, time + 0.015)
  }

  private holdAudioParam(parameter: AudioParam, time: number): void {
    if (typeof parameter.cancelAndHoldAtTime === 'function') {
      parameter.cancelAndHoldAtTime(time)
      return
    }
    const heldValue = parameter.value
    parameter.cancelScheduledValues(time)
    parameter.setValueAtTime(heldValue, time)
  }

  private stopGroup(group: UnisonGroup, time: number): void {
    group.lanes.forEach((lane) => {
      lane.oscillatorA.stop(time)
      lane.oscillatorB.stop(time)
    })
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('Wavetable oscillator has been disposed')
  }
}
