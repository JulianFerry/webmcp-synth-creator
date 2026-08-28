import { diffSupportedPaths, type PatchDiff } from '../commands/diff'
import { LatencyTrace } from '../dev/latencyTrace'
import type { SupportedPatchPath } from '../patch/paths'
import type {
  DelayState,
  EnvelopeState,
  FilterState,
  LfoState,
  ModulationRoute,
  OscillatorState,
  PatchState,
  ReverbState,
  VoiceState,
} from '../patch/types'
import { SessionService, type SessionCommitEvent } from '../session/SessionService'
import { resolveWavetable } from '../wavetables/registry'
import {
  cancelAndHoldAudioParam,
  scheduleEnvelopeAttack,
  scheduleEnvelopeRelease,
  updateEnvelopeSustain,
} from './envelope'
import { applyFilterState } from './filter'
import { DelayEffect } from './delay'
import {
  ModulationScheduler,
  type ModulationFrame,
  type ModulationTarget,
} from './ModulationScheduler'
import {
  createDraftAudioPatch,
  createEffectiveAudioPatch,
  getAudioPreviewBehavior,
  type AudioPreviewValues,
} from './preview'
import { VoiceAllocator } from './VoiceAllocator'
import { ReverbEffect } from './reverb'
import {
  BROWSER_OUTPUT_GAIN,
  configureOutputLimiter,
  VOICE_BUS_HEADROOM_GAIN,
} from './output'
import {
  WavetableVoiceOscillator,
  type UnisonConfiguration,
} from './WavetableVoiceOscillator'
import { transposeFrequency, velocityToGain } from './units'

export type BrowserSynthLifecycle = 'suspended' | 'running' | 'unavailable' | 'error'

export interface OscillatorReflection {
  enabled: boolean
  wavetablePosition: number
  level: number
  transposeSemitones: number
  fineTuneCents: number
  unisonVoices: number
  unisonDetune: number
  stereoSpread: number
}

export interface AudioPatchReflection {
  oscillators: [OscillatorReflection, OscillatorReflection]
  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState
  filter: FilterState
  lfo1: LfoState
  modulations: ModulationRoute[]
  voice: VoiceState
  effects: { delay: DelayState; reverb: ReverbState }
}

export interface AudioOscillatorUpdatePlan {
  wavetable: boolean
  position: boolean
  pitch: boolean
  level: boolean
  unison: boolean
}

export interface AudioUpdatePlan {
  oscillators: [AudioOscillatorUpdatePlan, AudioOscillatorUpdatePlan]
  envelope: boolean
  envelopeAttack: boolean
  envelopeHold: boolean
  envelopeDecay: boolean
  envelopeSustain: boolean
  envelopeRelease: boolean
  filter: boolean
  polyphony: boolean
  voiceLevel: boolean
  voiceGlide: boolean
  modulation: boolean
  delay: boolean
  reverb: boolean
}

export interface BrowserSynthState {
  lifecycle: BrowserSynthLifecycle
  held: boolean
  activeVoiceCount: number
  activeNotes: number[]
  polyphony: number
  stolenVoiceCount: number
  cutoffHz: number
  wavetablePosition: number
  previewWavetablePositions: [number | null, number | null]
  oscillators: [OscillatorReflection, OscillatorReflection]
  draft: AudioPatchReflection
  effective: AudioPatchReflection
  previewValues: AudioPreviewValues
  modulationScheduleVersion: number
  effects: { delay: DelayState; reverb: ReverbState }
  reflectedPatchName: string
  lastCorrelationId: string | null
  lastUpdatePlan: AudioUpdatePlan | null
}

type AudioContextFactory = () => AudioContext
type StateSubscriber = (state: BrowserSynthState) => void

const OSCILLATOR_OUTPUT_GAIN = 0.24

function emptyOscillatorPlan(): AudioOscillatorUpdatePlan {
  return { wavetable: false, position: false, pitch: false, level: false, unison: false }
}

export function planAudioPatchUpdate(changed: PatchDiff): AudioUpdatePlan {
  const plan: AudioUpdatePlan = {
    oscillators: [emptyOscillatorPlan(), emptyOscillatorPlan()],
    envelope: false,
    envelopeAttack: false,
    envelopeHold: false,
    envelopeDecay: false,
    envelopeSustain: false,
    envelopeRelease: false,
    filter: false,
    polyphony: false,
    voiceLevel: false,
    voiceGlide: false,
    modulation: false,
    delay: false,
    reverb: false,
  }

  for (const path of Object.keys(changed)) {
    const oscillatorMatch = /^oscillators\.(0|1)\.(.+)$/.exec(path)
    if (oscillatorMatch) {
      const index = Number(oscillatorMatch[1]) as 0 | 1
      const property = oscillatorMatch[2]
      if (property === 'wavetableId') plan.oscillators[index].wavetable = true
      if (property === 'wavetablePosition') plan.oscillators[index].position = true
      if (property === 'transposeSemitones' || property === 'fineTuneCents') {
        plan.oscillators[index].pitch = true
      }
      if (property === 'enabled' || property === 'level') plan.oscillators[index].level = true
      if (
        property === 'unisonVoices' ||
        property === 'unisonDetune' ||
        property === 'stereoSpread' ||
        property === 'randomPhase'
      ) {
        plan.oscillators[index].unison = true
      }
    }

    if (path.startsWith('ampEnvelope.')) plan.envelope = true
    if (path === 'ampEnvelope.attackSeconds') plan.envelopeAttack = true
    if (path === 'ampEnvelope.holdSeconds') plan.envelopeHold = true
    if (path === 'ampEnvelope.decaySeconds') plan.envelopeDecay = true
    if (path === 'ampEnvelope.sustainLevel') plan.envelopeSustain = true
    if (path === 'ampEnvelope.releaseSeconds') plan.envelopeRelease = true
    if (path.startsWith('filter.')) plan.filter = true
    if (path === 'voice.polyphony') plan.polyphony = true
    if (path === 'voice.velocitySensitivity') plan.voiceLevel = true
    if (path === 'voice.glideSeconds') plan.voiceGlide = true
    if (
      path.startsWith('lfo1.') ||
      path.startsWith('modEnvelope.') ||
      path === 'modulations' ||
      path.startsWith('filter.') ||
      /^oscillators\.(0|1)\.(enabled|level|wavetablePosition|transposeSemitones|fineTuneCents)$/.test(
        path,
      )
    ) {
      plan.modulation = true
    }
    if (path.startsWith('effects.delay.')) plan.delay = true
    if (path.startsWith('effects.reverb.')) plan.reverb = true
  }

  return plan
}

function unisonConfiguration(oscillator: OscillatorState): UnisonConfiguration {
  return {
    voices: oscillator.unisonVoices,
    detune: oscillator.unisonDetune,
    stereoSpread: oscillator.stereoSpread,
  }
}

function oscillatorReflection(oscillator: OscillatorState): OscillatorReflection {
  return {
    enabled: oscillator.enabled,
    wavetablePosition: oscillator.wavetablePosition,
    level: oscillator.level,
    transposeSemitones: oscillator.transposeSemitones,
    fineTuneCents: oscillator.fineTuneCents,
    unisonVoices: oscillator.unisonVoices,
    unisonDetune: oscillator.unisonDetune,
    stereoSpread: oscillator.stereoSpread,
  }
}

function patchReflection(patch: PatchState): AudioPatchReflection {
  return {
    oscillators: [
      oscillatorReflection(patch.oscillators[0]),
      oscillatorReflection(patch.oscillators[1]),
    ],
    ampEnvelope: structuredClone(patch.ampEnvelope),
    modEnvelope: structuredClone(patch.modEnvelope),
    filter: structuredClone(patch.filter),
    lfo1: structuredClone(patch.lfo1),
    modulations: structuredClone(patch.modulations),
    voice: structuredClone(patch.voice),
    effects: structuredClone(patch.effects),
  }
}

class BrowserVoice implements ModulationTarget {
  private patch: PatchState
  private readonly oscillators: [WavetableVoiceOscillator, WavetableVoiceOscillator]
  private readonly oscillatorLevels: [GainNode, GainNode]
  private readonly filter: BiquadFilterNode
  private readonly amplitude: GainNode
  private readonly velocityGain: number
  private readonly modulation: ModulationScheduler
  private released = false
  private releaseTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private readonly context: AudioContext,
    patch: PatchState,
    readonly midi: number,
    velocity: number,
    output: AudioNode,
    startMidi?: number,
    private readonly onDisposed: () => void = () => undefined,
  ) {
    this.patch = patch
    this.velocityGain = velocityToGain(velocity, patch.voice.velocitySensitivity)
    this.filter = context.createBiquadFilter()
    this.amplitude = context.createGain()

    const oscillatorA = new WavetableVoiceOscillator(
      context,
      resolveWavetable(patch.wavetableData, patch.oscillators[0].wavetableId),
      unisonConfiguration(patch.oscillators[0]),
    )
    const oscillatorB = new WavetableVoiceOscillator(
      context,
      resolveWavetable(patch.wavetableData, patch.oscillators[1].wavetableId),
      unisonConfiguration(patch.oscillators[1]),
    )
    const levelA = context.createGain()
    const levelB = context.createGain()
    oscillatorA.connect(levelA)
    oscillatorB.connect(levelB)
    levelA.connect(this.filter)
    levelB.connect(this.filter)
    this.filter.connect(this.amplitude).connect(output)
    this.oscillators = [oscillatorA, oscillatorB]
    this.oscillatorLevels = [levelA, levelB]

    const now = context.currentTime
    patch.oscillators.forEach((oscillator, index) => {
      this.oscillators[index].setPositionAtTime(oscillator.wavetablePosition, now)
      this.oscillators[index].setFrequencyAtTime(
        transposeFrequency(midi, oscillator.transposeSemitones, oscillator.fineTuneCents),
        now,
        startMidi === undefined ? 0 : patch.voice.glideSeconds,
        startMidi === undefined
          ? undefined
          : transposeFrequency(
              startMidi,
              oscillator.transposeSemitones,
              oscillator.fineTuneCents,
            ),
      )
      this.applyOscillatorLevel(index, oscillator, now)
    })
    applyFilterState(this.filter, patch.filter, now)
    scheduleEnvelopeAttack(this.amplitude.gain, patch.ampEnvelope, now)
    this.modulation = new ModulationScheduler(context, patch, midi, now, this)
  }

  applyPatch(patch: PatchState, plan: AudioUpdatePlan, time: number): void {
    patch.oscillators.forEach((oscillator, index) => {
      const oscillatorPlan = plan.oscillators[index]
      if (oscillatorPlan.wavetable) {
        this.oscillators[index].setWavetable(
          resolveWavetable(patch.wavetableData, oscillator.wavetableId),
        )
      }
      if (oscillatorPlan.unison) {
        this.oscillators[index].setUnisonAtTime(unisonConfiguration(oscillator), time)
      }
      if (oscillatorPlan.position) {
        this.oscillators[index].setPositionAtTime(oscillator.wavetablePosition, time)
      }
      if (oscillatorPlan.pitch) {
        this.oscillators[index].setFrequencyAtTime(
          transposeFrequency(
            this.midi,
            oscillator.transposeSemitones,
            oscillator.fineTuneCents,
          ),
          time,
          0.015,
        )
      }
      if (oscillatorPlan.level) {
        this.applyOscillatorLevel(index, oscillator, time)
      }
    })

    if (plan.filter) applyFilterState(this.filter, patch.filter, time, 0.015)
    if (plan.envelopeSustain && !this.released) {
      updateEnvelopeSustain(this.amplitude.gain, patch.ampEnvelope.sustainLevel, time)
    }
    this.patch = patch
    if (plan.modulation) this.modulation.updatePatch(patch, time)
  }

  applyModulationFrame(frame: ModulationFrame, time: number): void {
    frame.oscillatorLevels.forEach((level, index) => {
      const oscillator = this.patch.oscillators[index]
      this.oscillatorLevels[index].gain.linearRampToValueAtTime(
        oscillator.enabled ? level * this.velocityGain * OSCILLATOR_OUTPUT_GAIN : 0,
        time,
      )
      this.oscillators[index].setPositionAtTime(frame.wavetablePositions[index], time)
      this.oscillators[index].scheduleFrequencyAtTime(frame.oscillatorFrequencies[index], time)
    })
    const cutoff = this.patch.filter.enabled
      ? frame.filterCutoffHz
      : Math.min(20_000, this.context.sampleRate * 0.49)
    this.filter.frequency.linearRampToValueAtTime(cutoff, time)
  }

  resetModulation(patch: PatchState, time: number): void {
    patch.oscillators.forEach((oscillator, index) => {
      this.applyOscillatorLevel(index, oscillator, time)
      this.oscillators[index].setPositionAtTime(oscillator.wavetablePosition, time)
      this.oscillators[index].setFrequencyAtTime(
        transposeFrequency(
          this.midi,
          oscillator.transposeSemitones,
          oscillator.fineTuneCents,
        ),
        time,
      )
    })
    applyFilterState(this.filter, patch.filter, time)
  }

  release(time: number, stolen = false): void {
    if (this.released) return
    this.released = true
    this.modulation.release(time)
    const releaseSeconds = stolen ? 0.025 : this.patch.ampEnvelope.releaseSeconds
    this.scheduleRelease(releaseSeconds, time)
  }

  disposeImmediately(time: number): void {
    if (this.disposed) return
    this.amplitude.gain.cancelScheduledValues(time)
    this.amplitude.gain.setValueAtTime(0, time)
    this.disposeOscillators(time)
  }

  private scheduleRelease(releaseSeconds: number, time: number): void {
    const releaseEnd = scheduleEnvelopeRelease(this.amplitude.gain, releaseSeconds, time)
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer)
    const delayMilliseconds = Math.max(
      0,
      (releaseEnd - this.context.currentTime + 0.01) * 1_000,
    )
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null
      this.disposeOscillators(this.context.currentTime)
    }, delayMilliseconds)
  }

  private disposeOscillators(time: number): void {
    if (this.disposed) return
    this.disposed = true
    this.modulation.dispose()
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer)
    this.releaseTimer = null
    this.oscillators.forEach((oscillator) => oscillator.dispose(time))
    this.onDisposed()
  }

  private applyOscillatorLevel(
    index: number,
    oscillator: OscillatorState,
    time: number,
  ): void {
    const level = oscillator.enabled
      ? oscillator.level * this.velocityGain * OSCILLATOR_OUTPUT_GAIN
      : 0
    const parameter = this.oscillatorLevels[index].gain
    cancelAndHoldAudioParam(parameter, time)
    parameter.linearRampToValueAtTime(level, time + 0.01)
  }
}

export class BrowserSynth {
  private patch: PatchState
  private draftPatch: PatchState
  private effectivePatch: PatchState
  private previewValues: AudioPreviewValues = {}
  private state: BrowserSynthState
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private output: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private delayEffect: DelayEffect | null = null
  private reverbEffect: ReverbEffect | null = null
  private allocator: VoiceAllocator<BrowserVoice>
  private readonly voices = new Set<BrowserVoice>()
  private lastPlayedMidi: number | null = null
  private readonly subscribers = new Set<StateSubscriber>()
  private readonly unsubscribeSession: () => void
  private readonly createAudioContext: AudioContextFactory

  constructor(
    session: SessionService,
    private readonly trace: LatencyTrace,
    createAudioContext?: AudioContextFactory,
  ) {
    this.patch = session.getPatch()
    this.draftPatch = structuredClone(this.patch)
    this.effectivePatch = structuredClone(this.patch)
    this.allocator = new VoiceAllocator(this.patch.voice.polyphony)
    this.createAudioContext = createAudioContext ?? (() => new AudioContext())
    const audioAvailable = createAudioContext !== undefined || typeof AudioContext !== 'undefined'
    this.state = {
      lifecycle: audioAvailable ? 'suspended' : 'unavailable',
      held: false,
      activeVoiceCount: 0,
      activeNotes: [],
      polyphony: this.patch.voice.polyphony,
      stolenVoiceCount: 0,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      previewWavetablePositions: [null, null],
      oscillators: [
        oscillatorReflection(this.patch.oscillators[0]),
        oscillatorReflection(this.patch.oscillators[1]),
      ],
      draft: patchReflection(this.draftPatch),
      effective: patchReflection(this.effectivePatch),
      previewValues: {},
      modulationScheduleVersion: 0,
      effects: structuredClone(this.patch.effects),
      reflectedPatchName: this.patch.metadata.name,
      lastCorrelationId: null,
      lastUpdatePlan: null,
    }
    this.unsubscribeSession = session.subscribe((event) => this.applyCommittedPatch(event))
  }

  getState(): BrowserSynthState {
    return structuredClone(this.state)
  }

  subscribe(subscriber: StateSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  async startAudio(): Promise<void> {
    if (this.state.lifecycle === 'unavailable') {
      throw new Error('Web Audio is unavailable in this browser')
    }

    try {
      if (!this.context) {
        this.context = this.createAudioContext()
        this.master = this.context.createGain()
        this.master.gain.setValueAtTime(VOICE_BUS_HEADROOM_GAIN, this.context.currentTime)
        this.output = this.context.createGain()
        this.output.gain.setValueAtTime(BROWSER_OUTPUT_GAIN, this.context.currentTime)
        this.limiter = this.context.createDynamicsCompressor()
        configureOutputLimiter(this.limiter, this.context.currentTime)
        this.delayEffect = new DelayEffect(this.context, this.effectivePatch.effects.delay)
        this.reverbEffect = new ReverbEffect(this.context, this.effectivePatch.effects.reverb)
        this.master.connect(this.delayEffect.input)
        this.delayEffect.connect(this.reverbEffect.input)
        this.reverbEffect.connect(this.output)
        this.output.connect(this.limiter).connect(this.context.destination)
        this.context.addEventListener('statechange', () => this.reflectContextState())
      }
      if (this.context.state === 'suspended') await this.context.resume()
      this.reflectContextState()
    } catch (error) {
      this.state = { ...this.state, lifecycle: 'error' }
      this.notify()
      throw error
    }
  }

  async noteOn(midi: number, velocity = 0.85): Promise<void> {
    await this.startAudio()
    if (!this.context || !this.master) return

    const now = this.context.currentTime
    const replaced = this.allocator.releaseNote(midi)
    replaced.forEach((slot) => slot.voice.release(now, true))

    const startMidi =
      this.effectivePatch.voice.glideSeconds > 0 && this.lastPlayedMidi !== null
        ? this.lastPlayedMidi
        : undefined
    const voice = new BrowserVoice(
      this.context,
      this.effectivePatch,
      midi,
      velocity,
      this.master,
      startMidi,
      () => this.voices.delete(voice),
    )
    this.voices.add(voice)
    const { stolen } = this.allocator.claim(midi, velocity, now, voice)
    if (stolen) {
      stolen.voice.release(now, true)
      this.state = { ...this.state, stolenVoiceCount: this.state.stolenVoiceCount + 1 }
    }
    this.lastPlayedMidi = midi
    this.reflectActiveVoices()
  }

  noteOff(midi: number): void {
    const now = this.context?.currentTime ?? 0
    this.allocator.releaseNote(midi).forEach((slot) => slot.voice.release(now))
    this.reflectActiveVoices()
  }

  async toggleHeldNote(): Promise<BrowserSynthState> {
    if (this.allocator.activeNotes.includes(60)) this.noteOff(60)
    else await this.noteOn(60)
    return this.getState()
  }

  async holdNote(midi = 60): Promise<void> {
    if (!this.allocator.activeNotes.includes(midi)) await this.noteOn(midi)
  }

  releaseHeldNote(): void {
    this.noteOff(60)
  }

  releaseAllNotes(): void {
    const now = this.context?.currentTime ?? 0
    this.allocator.releaseAll().forEach((slot) => slot.voice.release(now))
    this.reflectActiveVoices()
  }

  previewPatchChange(path: SupportedPatchPath, value: unknown): boolean {
    const behavior = getAudioPreviewBehavior(path)
    if (!behavior || behavior.scope === 'commit-only') return false

    this.applyPreviewValues({ ...this.previewValues, [path]: value })
    return true
  }

  cancelPatchPreview(path: SupportedPatchPath): void {
    if (!(path in this.previewValues)) return
    const nextPreviewValues = { ...this.previewValues }
    delete nextPreviewValues[path]
    this.applyPreviewValues(nextPreviewValues)
  }

  cancelAllPatchPreviews(): void {
    if (Object.keys(this.previewValues).length === 0) return
    this.applyPreviewValues({})
  }

  previewWavetablePosition(index: 0 | 1, position: number): void {
    this.previewPatchChange(`oscillators.${index}.wavetablePosition`, position)
  }

  cancelWavetablePositionPreview(index: 0 | 1): void {
    this.cancelPatchPreview(`oscillators.${index}.wavetablePosition`)
  }

  dispose(): void {
    const now = this.context?.currentTime ?? 0
    this.allocator.releaseAll()
    this.voices.forEach((voice) => voice.disposeImmediately(now))
    this.voices.clear()
    this.unsubscribeSession()
    void this.context?.close()
    this.context = null
    this.master = null
    this.output = null
    this.limiter = null
    this.delayEffect = null
    this.reverbEffect = null
    this.previewValues = {}
    this.draftPatch = structuredClone(this.patch)
    this.effectivePatch = structuredClone(this.patch)
    this.state = {
      ...this.state,
      held: false,
      activeVoiceCount: 0,
      activeNotes: [],
      previewWavetablePositions: [null, null],
      oscillators: [
        oscillatorReflection(this.patch.oscillators[0]),
        oscillatorReflection(this.patch.oscillators[1]),
      ],
      draft: patchReflection(this.draftPatch),
      effective: patchReflection(this.effectivePatch),
      previewValues: {},
      effects: structuredClone(this.patch.effects),
    }
  }

  private applyCommittedPatch(event: SessionCommitEvent): void {
    const previewPaths = Object.keys(this.previewValues) as SupportedPatchPath[]
    const previousEffectivePatch = this.effectivePatch
    this.patch = structuredClone(event.patch)
    this.previewValues = {}
    this.draftPatch = structuredClone(event.patch)
    this.effectivePatch = structuredClone(event.patch)
    const changedPaths = [
      ...new Set([
        ...(Object.keys(event.changed) as SupportedPatchPath[]),
        ...previewPaths,
      ]),
    ]
    const effectiveChanged = diffSupportedPaths(
      previousEffectivePatch,
      this.effectivePatch,
      changedPaths,
    )
    const plan = this.applyAudioPatch(this.effectivePatch, effectiveChanged, true)

    this.state = {
      ...this.state,
      held: this.allocator.activeNotes.includes(60),
      activeVoiceCount: this.allocator.activeCount,
      activeNotes: this.allocator.activeNotes,
      polyphony: this.patch.voice.polyphony,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      previewWavetablePositions: [null, null],
      oscillators: [
        oscillatorReflection(this.effectivePatch.oscillators[0]),
        oscillatorReflection(this.effectivePatch.oscillators[1]),
      ],
      draft: patchReflection(this.draftPatch),
      effective: patchReflection(this.effectivePatch),
      previewValues: {},
      modulationScheduleVersion:
        this.state.modulationScheduleVersion + (plan.modulation && this.voices.size > 0 ? 1 : 0),
      effects: structuredClone(this.patch.effects),
      reflectedPatchName: this.patch.metadata.name,
      lastCorrelationId: event.correlationId,
      lastUpdatePlan: plan,
    }
    this.notify()
    this.trace.record(event.correlationId, 'audio_diff_applied', event.source)
  }

  private applyPreviewValues(nextPreviewValues: AudioPreviewValues): void {
    const changedPaths = [
      ...new Set([
        ...(Object.keys(this.previewValues) as SupportedPatchPath[]),
        ...(Object.keys(nextPreviewValues) as SupportedPatchPath[]),
      ]),
    ]
    const nextDraftPatch = createDraftAudioPatch(this.patch, nextPreviewValues)
    const nextEffectivePatch = createEffectiveAudioPatch(this.patch, nextPreviewValues)
    const changed = diffSupportedPaths(
      this.effectivePatch,
      nextEffectivePatch,
      changedPaths,
    )
    this.previewValues = nextPreviewValues
    this.draftPatch = nextDraftPatch
    this.effectivePatch = nextEffectivePatch
    const plan = this.applyAudioPatch(nextEffectivePatch, changed, false)
    this.reflectPreviewState(plan)
  }

  private applyAudioPatch(
    patch: PatchState,
    changed: PatchDiff,
    allowDestructiveChanges: boolean,
  ): AudioUpdatePlan {
    const plan = planAudioPatchUpdate(changed)
    const now = this.context?.currentTime ?? 0

    if (plan.polyphony && allowDestructiveChanges) {
      const stolen = this.allocator.setLimit(patch.voice.polyphony)
      stolen.forEach((slot) => slot.voice.release(now, true))
      if (stolen.length > 0) {
        this.state = {
          ...this.state,
          stolenVoiceCount: this.state.stolenVoiceCount + stolen.length,
        }
      }
    }
    if (plan.delay) this.delayEffect?.applyState(patch.effects.delay, now)
    if (plan.reverb) this.reverbEffect?.applyState(patch.effects.reverb, now)
    this.voices.forEach((voice) => voice.applyPatch(patch, plan, now))
    return plan
  }

  private reflectPreviewState(plan: AudioUpdatePlan): void {
    const firstPosition = this.previewValues['oscillators.0.wavetablePosition']
    const secondPosition = this.previewValues['oscillators.1.wavetablePosition']
    const reflection = patchReflection(this.effectivePatch)
    this.state = {
      ...this.state,
      activeVoiceCount: this.allocator.activeCount,
      activeNotes: this.allocator.activeNotes,
      previewWavetablePositions: [
        typeof firstPosition === 'number' ? firstPosition : null,
        typeof secondPosition === 'number' ? secondPosition : null,
      ],
      oscillators: reflection.oscillators,
      draft: patchReflection(this.draftPatch),
      effective: reflection,
      previewValues: structuredClone(this.previewValues),
      effects: structuredClone(this.effectivePatch.effects),
      lastUpdatePlan: plan,
    }
    this.notify()
  }

  private reflectContextState(): void {
    if (!this.context) return
    this.state = {
      ...this.state,
      lifecycle: this.context.state === 'running' ? 'running' : 'suspended',
    }
    this.notify()
  }

  private reflectActiveVoices(): void {
    this.state = {
      ...this.state,
      held: this.allocator.activeNotes.includes(60),
      activeVoiceCount: this.allocator.activeCount,
      activeNotes: this.allocator.activeNotes,
    }
    this.notify()
  }

  private notify(): void {
    const state = this.getState()
    this.subscribers.forEach((subscriber) => subscriber(state))
  }
}
