import { LatencyTrace } from '../dev/latencyTrace'
import type { PatchState } from '../patch/types'
import { SessionService, type SessionCommitEvent } from '../session/SessionService'
import { resolveWavetable } from '../wavetables/registry'
import { WavetableVoiceOscillator } from './WavetableVoiceOscillator'

export type BrowserSynthLifecycle = 'suspended' | 'running' | 'unavailable' | 'error'

export interface BrowserSynthState {
  lifecycle: BrowserSynthLifecycle
  held: boolean
  cutoffHz: number
  wavetablePosition: number
  reflectedPatchName: string
  lastCorrelationId: string | null
}

type AudioContextFactory = () => AudioContext
type StateSubscriber = (state: BrowserSynthState) => void

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export class BrowserSynth {
  private patch: PatchState
  private state: BrowserSynthState
  private context: AudioContext | null = null
  private oscillator: WavetableVoiceOscillator | null = null
  private filter: BiquadFilterNode | null = null
  private amplitude: GainNode | null = null
  private readonly subscribers = new Set<StateSubscriber>()
  private readonly unsubscribeSession: () => void

  constructor(
    session: SessionService,
    private readonly trace: LatencyTrace,
    private readonly createAudioContext: AudioContextFactory = () => new AudioContext(),
  ) {
    this.patch = session.getPatch()
    this.state = {
      lifecycle: typeof AudioContext === 'undefined' ? 'unavailable' : 'suspended',
      held: false,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      reflectedPatchName: this.patch.metadata.name,
      lastCorrelationId: null,
    }
    this.unsubscribeSession = session.subscribe((event) => this.applyCommittedPatch(event))
  }

  getState(): BrowserSynthState {
    return { ...this.state }
  }

  subscribe(subscriber: StateSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  async toggleHeldNote(): Promise<BrowserSynthState> {
    if (this.state.held) this.releaseHeldNote()
    else await this.holdNote()
    return this.getState()
  }

  async holdNote(midi = 60): Promise<void> {
    if (this.state.held) return
    if (this.state.lifecycle === 'unavailable') {
      throw new Error('Web Audio is unavailable in this browser')
    }

    try {
      this.context ??= this.createAudioContext()
      if (this.context.state === 'suspended') await this.context.resume()

      this.filter = this.context.createBiquadFilter()
      this.amplitude = this.context.createGain()
      this.oscillator = new WavetableVoiceOscillator(
        this.context,
        resolveWavetable(
          this.patch.wavetableData,
          this.patch.oscillators[0].wavetableId,
        ),
      )
      this.oscillator.connect(this.filter)
      this.filter.connect(this.amplitude).connect(this.context.destination)

      const now = this.context.currentTime
      this.oscillator.setFrequencyAtTime(this.frequencyForMidi(midi), now)
      this.oscillator.setPositionAtTime(this.patch.oscillators[0].wavetablePosition, now)
      this.applyFilter(now)
      this.amplitude.gain.setValueAtTime(0, now)
      this.amplitude.gain.linearRampToValueAtTime(
        this.patch.oscillators[0].level * 0.22,
        now + this.patch.ampEnvelope.attackSeconds,
      )

      this.state = { ...this.state, lifecycle: 'running', held: true }
      this.notify()
    } catch (error) {
      this.state = { ...this.state, lifecycle: 'error', held: false }
      this.notify()
      throw error
    }
  }

  releaseHeldNote(): void {
    if (!this.state.held) return
    const now = this.context?.currentTime ?? 0
    this.oscillator?.dispose(now)
    this.oscillator = null
    this.filter = null
    this.amplitude = null
    this.state = { ...this.state, held: false }
    this.notify()
  }

  dispose(): void {
    this.releaseHeldNote()
    this.unsubscribeSession()
    void this.context?.close()
    this.context = null
  }

  private applyCommittedPatch(event: SessionCommitEvent): void {
    this.patch = event.patch
    const now = this.context?.currentTime ?? 0

    if (this.oscillator) {
      this.oscillator.setWavetable(
        resolveWavetable(
          this.patch.wavetableData,
          this.patch.oscillators[0].wavetableId,
        ),
      )
      this.oscillator.setPositionAtTime(this.patch.oscillators[0].wavetablePosition, now)
      this.oscillator.setFrequencyAtTime(this.frequencyForMidi(60), now)
    }
    if (this.filter) this.applyFilter(now)
    if (this.amplitude) {
      this.amplitude.gain.setValueAtTime(this.patch.oscillators[0].level * 0.22, now)
    }

    this.state = {
      ...this.state,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      reflectedPatchName: this.patch.metadata.name,
      lastCorrelationId: event.correlationId,
    }
    this.notify()
    this.trace.record(event.correlationId, 'audio_diff_applied', event.source)
  }

  private applyFilter(time: number): void {
    if (!this.filter) return
    this.filter.type = this.patch.filter.type
    this.filter.frequency.setValueAtTime(
      this.patch.filter.enabled ? this.patch.filter.cutoffHz : 20_000,
      time,
    )
    this.filter.Q.setValueAtTime(this.patch.filter.resonance * 18, time)
  }

  private frequencyForMidi(midi: number): number {
    const oscillator = this.patch.oscillators[0]
    return (
      midiToHz(midi + oscillator.transposeSemitones) *
      2 ** (oscillator.fineTuneCents / 1200)
    )
  }

  private notify(): void {
    const state = this.getState()
    this.subscribers.forEach((subscriber) => subscriber(state))
  }
}
