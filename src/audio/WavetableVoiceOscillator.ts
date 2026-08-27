import type { WavetableState } from '../patch/types'
import { toPeriodicWaveCoefficients } from '../wavetables/render'

export class WavetableVoiceOscillator {
  private readonly oscillatorA: OscillatorNode
  private readonly oscillatorB: OscillatorNode
  private readonly gainA: GainNode
  private readonly gainB: GainNode
  private readonly output: GainNode
  private waves: PeriodicWave[] = []
  private disposed = false

  constructor(
    private readonly context: AudioContext,
    wavetable: WavetableState,
  ) {
    this.oscillatorA = context.createOscillator()
    this.oscillatorB = context.createOscillator()
    this.gainA = context.createGain()
    this.gainB = context.createGain()
    this.output = context.createGain()

    this.oscillatorA.connect(this.gainA).connect(this.output)
    this.oscillatorB.connect(this.gainB).connect(this.output)
    this.setWavetable(wavetable)
    this.setPositionAtTime(0, context.currentTime)
    this.oscillatorA.start()
    this.oscillatorB.start()
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  setWavetable(wavetable: WavetableState): void {
    this.ensureActive()
    this.waves = wavetable.frames.map((frame) => {
      const { real, imag } = toPeriodicWaveCoefficients(frame)
      return this.context.createPeriodicWave(real, imag, { disableNormalization: false })
    })
  }

  setPositionAtTime(position: number, time: number): void {
    this.ensureActive()
    const clamped = Math.max(0, Math.min(1, position))
    const framePosition = clamped * Math.max(0, this.waves.length - 1)
    const lowerIndex = Math.floor(framePosition)
    const upperIndex = Math.min(this.waves.length - 1, lowerIndex + 1)
    const mix = framePosition - lowerIndex

    this.oscillatorA.setPeriodicWave(this.waves[lowerIndex])
    this.oscillatorB.setPeriodicWave(this.waves[upperIndex])
    this.gainA.gain.setValueAtTime(1 - mix, time)
    this.gainB.gain.setValueAtTime(mix, time)
  }

  setFrequencyAtTime(hz: number, time: number): void {
    this.ensureActive()
    this.oscillatorA.frequency.setValueAtTime(hz, time)
    this.oscillatorB.frequency.setValueAtTime(hz, time)
  }

  dispose(time = this.context.currentTime): void {
    if (this.disposed) return
    this.disposed = true
    this.output.gain.setValueAtTime(this.output.gain.value, time)
    this.output.gain.linearRampToValueAtTime(0, time + 0.02)
    this.oscillatorA.stop(time + 0.03)
    this.oscillatorB.stop(time + 0.03)
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('Wavetable oscillator has been disposed')
  }
}
