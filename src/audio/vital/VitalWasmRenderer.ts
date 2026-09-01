import { diffSupportedPaths, type PatchDiff } from '../../commands/diff'
import { LatencyTrace } from '../../dev/latencyTrace'
import { isSupportedPatchPath, type SupportedPatchPath } from '../../patch/paths'
import type { PatchState } from '../../patch/types'
import { SessionService, type SessionCommitEvent } from '../../session/SessionService'
import {
  VitalPresetAdapter,
  type VitalControlOperation,
} from '../../vital/VitalPresetAdapter'
import {
  createDraftAudioPatch,
  createEffectiveAudioPatch,
  getAudioPreviewBehavior,
  type AudioPreviewValues,
} from '../preview'
import { patchReflection } from '../reflection'
import {
  AUDITION_HELD_MIDI_NOTE,
  type NoteOnTimingMeasurement,
  type SynthRenderer,
  type SynthRendererState,
} from '../SynthRenderer'
import { AUDITION_BPM } from '../tempo'
import type { VitalWorkletEvent } from './protocol'
import { vitalEnginePayload } from './state'
import {
  preloadVitalWasm,
  VitalWorkletHost,
  type VitalWorkletEventListener,
} from './VitalWorkletHost'

export interface VitalRendererHost {
  prepare(): Promise<void>
  subscribe(listener: VitalWorkletEventListener): () => void
  loadState(revision: number, json: string): boolean
  setControls(revision: number, operations: VitalControlOperation[]): boolean
  setBpm(bpm: number): void
  noteOn(note: number, velocity?: number): void
  noteOff(note: number): void
  allNotesOff(): void
  dispose(): void
}

export interface VitalWasmRendererOptions {
  createAudioContext?: () => AudioContext
  createHost?: (context: BaseAudioContext) => VitalRendererHost
  performanceNow?: () => number
  preloadWasm?: () => Promise<unknown>
}

interface ActiveNote {
  order: number
  velocity: number
}

interface PendingRevision {
  kind: 'controls' | 'state'
  modulationChanged: boolean
}

const FULL_STATE_PATHS = new Set([
  'lfo1.points',
  'oscillators.0.wavetableId',
  'oscillators.1.wavetableId',
  'oscillators.2.wavetableId',
  'wavetableData',
])

type StateSubscriber = (state: SynthRendererState) => void

export class VitalWasmRenderer implements SynthRenderer {
  private readonly activeNotes = new Map<number, ActiveNote>()
  private adapter: VitalPresetAdapter | null = null
  private readonly adapterPromise: Promise<VitalPresetAdapter>
  private context: AudioContext | null = null
  private disposed = false
  private draftPatch: PatchState
  private effectivePatch: PatchState
  private host: VitalRendererHost | null = null
  private noteOrder = 0
  private patch: PatchState
  private readonly pendingRevisions = new Map<number, PendingRevision>()
  private preparePromise: Promise<void> | null = null
  private previewValues: AudioPreviewValues = {}
  private revision = 0
  private state: SynthRendererState
  private readonly subscribers = new Set<StateSubscriber>()
  private unsubscribeHost: (() => void) | null = null
  private readonly unsubscribeSession: () => void

  private readonly createAudioContext: () => AudioContext
  private readonly createHost: (context: BaseAudioContext) => VitalRendererHost
  private readonly performanceNow: () => number
  private readonly preloadWasm: () => Promise<unknown>

  constructor(
    session: SessionService,
    adapter: VitalPresetAdapter | Promise<VitalPresetAdapter>,
    private readonly trace: LatencyTrace,
    options: VitalWasmRendererOptions = {},
  ) {
    this.patch = session.getPatch()
    this.draftPatch = structuredClone(this.patch)
    this.effectivePatch = structuredClone(this.patch)
    this.adapterPromise = Promise.resolve(adapter)
    this.createAudioContext =
      options.createAudioContext ?? (() => new AudioContext({ latencyHint: 'interactive' }))
    this.createHost = options.createHost ?? ((context) => new VitalWorkletHost(context))
    this.performanceNow = options.performanceNow ?? (() => performance.now())
    this.preloadWasm = options.preloadWasm ?? preloadVitalWasm

    const audioAvailable =
      options.createAudioContext !== undefined || typeof AudioContext !== 'undefined'
    const reflection = patchReflection(this.patch)
    this.state = {
      lifecycle: audioAvailable ? 'suspended' : 'unavailable',
      held: false,
      activeVoiceCount: 0,
      activeNotes: [],
      polyphony: this.patch.voice.polyphony,
      stolenVoiceCount: 0,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      previewWavetablePositions: [null, null, null],
      oscillators: reflection.oscillators,
      draft: reflection,
      effective: reflection,
      previewValues: {},
      modulationScheduleVersion: 0,
      effects: structuredClone(this.patch.effects),
      reflectedPatchName: this.patch.metadata.name,
      lastNoteOnTiming: null,
    }
    this.unsubscribeSession = session.subscribe((event) => this.applyCommittedPatch(event))
  }

  getState(): SynthRendererState {
    return structuredClone(this.state)
  }

  subscribe(listener: StateSubscriber): () => void {
    this.subscribers.add(listener)
    return () => this.subscribers.delete(listener)
  }

  prepare(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Vital renderer is disposed'))
    if (this.state.lifecycle === 'unavailable') {
      return Promise.reject(new Error('Web Audio is unavailable in this browser'))
    }

    this.preparePromise ??= Promise.all([this.adapterPromise, this.preloadWasm()])
      .then(([adapter]) => {
        if (this.disposed) throw new Error('Vital renderer was disposed during preparation')
        this.adapter = adapter
      })
      .catch((error: unknown) => {
        this.reflectError()
        throw error
      })
    return this.preparePromise
  }

  async startAudio(): Promise<void> {
    if (this.state.lifecycle === 'unavailable') {
      throw new Error('Web Audio is unavailable in this browser')
    }

    try {
      await this.prepare()
      if (this.context === null) this.initializeAudioHost()
      const context = this.context
      const host = this.host
      if (context === null || host === null) throw new Error('Vital audio host is unavailable')

      if (context.state === 'suspended') await context.resume()
      await host.prepare()
      this.reflectContextState()
    } catch (error) {
      this.reflectError()
      throw error
    }
  }

  async noteOn(
    midi: number,
    velocity = 0.85,
    requestedAtMs = this.performanceNow(),
  ): Promise<void> {
    await this.startAudio()
    const host = this.requireHost()
    const audioReadyAtMs = this.performanceNow()
    const existing = this.activeNotes.get(midi)
    if (existing !== undefined) {
      host.noteOff(midi)
      this.activeNotes.delete(midi)
    }

    let stolen = false
    while (this.activeNotes.size >= this.effectivePatch.voice.polyphony) {
      const oldest = this.oldestActiveNote()
      if (oldest === null) break
      host.noteOff(oldest)
      this.activeNotes.delete(oldest)
      stolen = true
    }

    const noteStartedAtMs = this.performanceNow()
    host.noteOn(midi, velocity)
    const noteReadyAtMs = this.performanceNow()
    this.noteOrder += 1
    this.activeNotes.set(midi, { order: this.noteOrder, velocity })
    const timing = this.measureNoteOnTiming({
      midi,
      velocity,
      requestedAtMs,
      audioReadyAtMs,
      noteStartedAtMs,
      noteReadyAtMs,
    })
    this.publishNoteTiming(timing)
    this.state = {
      ...this.state,
      stolenVoiceCount: this.state.stolenVoiceCount + (stolen ? 1 : 0),
      lastNoteOnTiming: timing,
    }
    this.reflectActiveNotes()
  }

  noteOff(midi: number): void {
    if (!this.activeNotes.has(midi)) return
    this.host?.noteOff(midi)
    this.activeNotes.delete(midi)
    this.reflectActiveNotes()
  }

  releaseAllNotes(): void {
    this.host?.allNotesOff()
    this.activeNotes.clear()
    this.reflectActiveNotes()
  }

  async toggleHeldNote(requestedAtMs = this.performanceNow()): Promise<SynthRendererState> {
    if (this.activeNotes.has(AUDITION_HELD_MIDI_NOTE)) this.noteOff(AUDITION_HELD_MIDI_NOTE)
    else await this.noteOn(AUDITION_HELD_MIDI_NOTE, 0.85, requestedAtMs)
    return this.getState()
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

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.activeNotes.clear()
    this.unsubscribeHost?.()
    this.unsubscribeHost = null
    this.host?.dispose()
    this.host = null
    this.unsubscribeSession()
    void this.context?.close()
    this.context = null
    this.pendingRevisions.clear()
    this.previewValues = {}
    this.draftPatch = structuredClone(this.patch)
    this.effectivePatch = structuredClone(this.patch)
    const reflection = patchReflection(this.patch)
    this.state = {
      ...this.state,
      held: false,
      activeVoiceCount: 0,
      activeNotes: [],
      previewWavetablePositions: [null, null, null],
      oscillators: reflection.oscillators,
      draft: reflection,
      effective: reflection,
      previewValues: {},
      effects: structuredClone(this.patch.effects),
    }
  }

  private initializeAudioHost(): void {
    const context = this.createAudioContext()
    const host = this.createHost(context)
    this.context = context
    this.host = host
    context.addEventListener('statechange', () => this.reflectContextState())
    this.unsubscribeHost = host.subscribe((event) => this.handleHostEvent(event))
    host.setBpm(AUDITION_BPM)
    this.loadFullState(this.effectivePatch, false)
  }

  private applyCommittedPatch(event: SessionCommitEvent): void {
    const previewPaths = Object.keys(this.previewValues).filter(isSupportedPatchPath)
    const previousEffectivePatch = this.effectivePatch
    this.patch = structuredClone(event.patch)
    this.previewValues = {}
    this.draftPatch = structuredClone(event.patch)
    this.effectivePatch = structuredClone(event.patch)

    const supportedChangedPaths = [
      ...new Set([
        ...Object.keys(event.changed).filter(isSupportedPatchPath),
        ...previewPaths,
      ]),
    ]
    const effectiveChanged = diffSupportedPaths(
      previousEffectivePatch,
      this.effectivePatch,
      supportedChangedPaths,
    )
    if ('wavetableData' in event.changed) {
      effectiveChanged.wavetableData = event.changed.wavetableData
    }

    const stolen = this.trimActiveNotes(this.patch.voice.polyphony)
    try {
      this.applyPatchToHost(previousEffectivePatch, this.effectivePatch, effectiveChanged)
    } catch {
      this.reflectError()
    }

    const reflection = patchReflection(this.effectivePatch)
    this.state = {
      ...this.state,
      held: this.activeNotes.has(AUDITION_HELD_MIDI_NOTE),
      activeVoiceCount: this.activeNotes.size,
      activeNotes: [...this.activeNotes.keys()].sort((left, right) => left - right),
      polyphony: this.patch.voice.polyphony,
      stolenVoiceCount: this.state.stolenVoiceCount + stolen,
      cutoffHz: this.patch.filter.cutoffHz,
      wavetablePosition: this.patch.oscillators[0].wavetablePosition,
      previewWavetablePositions: [null, null, null],
      oscillators: reflection.oscillators,
      draft: patchReflection(this.draftPatch),
      effective: reflection,
      previewValues: {},
      effects: structuredClone(this.patch.effects),
      reflectedPatchName: this.patch.metadata.name,
    }
    this.notify()
    this.trace.record(event.correlationId, 'audio_diff_applied', event.source)
  }

  private applyPreviewValues(nextPreviewValues: AudioPreviewValues): void {
    const changedPaths = [
      ...new Set([
        ...Object.keys(this.previewValues).filter(isSupportedPatchPath),
        ...Object.keys(nextPreviewValues).filter(isSupportedPatchPath),
      ]),
    ]
    const previousEffectivePatch = this.effectivePatch
    const nextDraftPatch = createDraftAudioPatch(this.patch, nextPreviewValues)
    const nextEffectivePatch = createEffectiveAudioPatch(this.patch, nextPreviewValues)
    const changed = diffSupportedPaths(previousEffectivePatch, nextEffectivePatch, changedPaths)

    this.previewValues = nextPreviewValues
    this.draftPatch = nextDraftPatch
    this.effectivePatch = nextEffectivePatch
    this.applyPatchToHost(previousEffectivePatch, nextEffectivePatch, changed)

    const firstPosition = this.previewValues['oscillators.0.wavetablePosition']
    const secondPosition = this.previewValues['oscillators.1.wavetablePosition']
    const thirdPosition = this.previewValues['oscillators.2.wavetablePosition']
    const reflection = patchReflection(this.effectivePatch)
    this.state = {
      ...this.state,
      previewWavetablePositions: [
        typeof firstPosition === 'number' ? firstPosition : null,
        typeof secondPosition === 'number' ? secondPosition : null,
        typeof thirdPosition === 'number' ? thirdPosition : null,
      ],
      oscillators: reflection.oscillators,
      draft: patchReflection(this.draftPatch),
      effective: reflection,
      previewValues: structuredClone(this.previewValues),
      effects: structuredClone(this.effectivePatch.effects),
    }
    this.notify()
  }

  private applyPatchToHost(before: PatchState, after: PatchState, changed: PatchDiff): void {
    if (this.host === null || Object.keys(changed).length === 0) return
    const changedPaths = Object.keys(changed)
    const modulationChanged = changedPaths.some(isModulationPath)
    if (
      changedPaths.some((path) => FULL_STATE_PATHS.has(path)) ||
      (changedPaths.includes('modulations') && modulationTopologyChanged(before, after))
    ) {
      this.loadFullState(after, modulationChanged)
      return
    }

    const adapter = this.requireAdapter()
    const operations = adapter.controlOperations(before, after)
    if (operations.length === 0) return

    const revision = this.nextRevision()
    let pendingModulation = modulationChanged
    for (const [pendingRevision, pending] of this.pendingRevisions) {
      if (pending.kind !== 'controls') continue
      pendingModulation ||= pending.modulationChanged
      this.pendingRevisions.delete(pendingRevision)
    }
    if (this.host.setControls(revision, operations)) {
      this.pendingRevisions.set(revision, {
        kind: 'controls',
        modulationChanged: pendingModulation,
      })
    }
  }

  private loadFullState(patch: PatchState, modulationChanged: boolean): void {
    const revision = this.nextRevision()
    const json = vitalEnginePayload(this.requireAdapter(), patch)
    if (!this.requireHost().loadState(revision, json)) return

    for (const pendingRevision of this.pendingRevisions.keys()) {
      if (pendingRevision < revision) this.pendingRevisions.delete(pendingRevision)
    }
    this.pendingRevisions.set(revision, { kind: 'state', modulationChanged })
  }

  private handleHostEvent(event: VitalWorkletEvent): void {
    if (event.type === 'error') {
      this.reflectError()
      return
    }
    if (event.type !== 'state-applied' && event.type !== 'controls-applied') return

    const pending = this.pendingRevisions.get(event.revision)
    if (pending === undefined) return
    this.pendingRevisions.delete(event.revision)
    if (!pending.modulationChanged || this.activeNotes.size === 0) return
    this.state = {
      ...this.state,
      modulationScheduleVersion: this.state.modulationScheduleVersion + 1,
    }
    this.notify()
  }

  private trimActiveNotes(limit: number): number {
    let stolen = 0
    while (this.activeNotes.size > limit) {
      const oldest = this.oldestActiveNote()
      if (oldest === null) break
      this.host?.noteOff(oldest)
      this.activeNotes.delete(oldest)
      stolen += 1
    }
    return stolen
  }

  private oldestActiveNote(): number | null {
    let oldestNote: number | null = null
    let oldestOrder = Number.POSITIVE_INFINITY
    for (const [note, active] of this.activeNotes) {
      if (active.order < oldestOrder) {
        oldestNote = note
        oldestOrder = active.order
      }
    }
    return oldestNote
  }

  private reflectActiveNotes(): void {
    this.state = {
      ...this.state,
      held: this.activeNotes.has(AUDITION_HELD_MIDI_NOTE),
      activeVoiceCount: this.activeNotes.size,
      activeNotes: [...this.activeNotes.keys()].sort((left, right) => left - right),
    }
    this.notify()
  }

  private reflectContextState(): void {
    if (this.context === null || this.state.lifecycle === 'error') return
    const lifecycle = this.context.state === 'running' ? 'running' : 'suspended'
    if (this.state.lifecycle === lifecycle) return
    this.state = { ...this.state, lifecycle }
    this.notify()
  }

  private reflectError(): void {
    if (this.state.lifecycle === 'error') return
    this.state = { ...this.state, lifecycle: 'error' }
    this.notify()
  }

  private measureNoteOnTiming(input: {
    midi: number
    velocity: number
    requestedAtMs: number
    audioReadyAtMs: number
    noteStartedAtMs: number
    noteReadyAtMs: number
  }): NoteOnTimingMeasurement {
    const context = this.context!
    const outputContext = context as AudioContext & {
      outputLatency?: number
      getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number }
    }
    const baseLatencyMs = latencyMilliseconds(context.baseLatency)
    const outputLatencyMs = latencyMilliseconds(outputContext.outputLatency)
    const renderQuantumMs = (128 / context.sampleRate) * 1_000
    const inputToVoiceReadyMs = elapsedMilliseconds(input.requestedAtMs, input.noteReadyAtMs)
    const voiceGraphBuildMs = elapsedMilliseconds(input.noteStartedAtMs, input.noteReadyAtMs)
    const scheduledContextTimeSeconds = context.currentTime

    let outputTimestamp: { contextTime?: number; performanceTime?: number } | null = null
    try {
      outputTimestamp = outputContext.getOutputTimestamp?.() ?? null
    } catch {
      outputTimestamp = null
    }

    const outputContextTime = outputTimestamp?.contextTime
    const outputPerformanceTime = outputTimestamp?.performanceTime
    const hasUsableTimestamp =
      typeof outputContextTime === 'number' &&
      Number.isFinite(outputContextTime) &&
      typeof outputPerformanceTime === 'number' &&
      Number.isFinite(outputPerformanceTime) &&
      outputPerformanceTime > 0
    let estimateSource: NoteOnTimingMeasurement['estimateSource']
    let estimatedFirstSampleMs: number
    if (hasUsableTimestamp) {
      const earliestRenderTimeSeconds =
        Math.max(scheduledContextTimeSeconds, context.currentTime) + renderQuantumMs / 1_000
      const estimatedOutputAtMs =
        outputPerformanceTime + (earliestRenderTimeSeconds - outputContextTime) * 1_000
      estimatedFirstSampleMs = elapsedMilliseconds(
        input.requestedAtMs,
        Math.max(input.noteReadyAtMs, estimatedOutputAtMs),
      )
      estimateSource = 'output-timestamp'
    } else {
      estimatedFirstSampleMs =
        inputToVoiceReadyMs + renderQuantumMs + (baseLatencyMs ?? 0) + (outputLatencyMs ?? 0)
      estimateSource =
        baseLatencyMs !== null || outputLatencyMs !== null ? 'latency-properties' : 'app-only'
    }

    const attackMs = this.effectivePatch.ampEnvelope.attackSeconds * 1_000
    return {
      midi: input.midi,
      velocity: input.velocity,
      requestedAtMs: input.requestedAtMs,
      audioReadyMs: elapsedMilliseconds(input.requestedAtMs, input.audioReadyAtMs),
      voiceGraphBuildMs,
      inputToVoiceReadyMs,
      scheduledContextTimeSeconds,
      baseLatencyMs,
      outputLatencyMs,
      renderQuantumMs,
      attackMs,
      estimateSource,
      estimatedFirstSampleMs,
      estimatedEnvelopeMinus40DbMs: estimatedFirstSampleMs + attackMs * 0.01,
      estimatedEnvelopeMinus20DbMs: estimatedFirstSampleMs + attackMs * 0.1,
    }
  }

  private publishNoteTiming(timing: NoteOnTimingMeasurement): void {
    const timingGlobal = globalThis as typeof globalThis & {
      __WAVETABLE_WORKBENCH_NOTE_TIMING__?: NoteOnTimingMeasurement
    }
    timingGlobal.__WAVETABLE_WORKBENCH_NOTE_TIMING__ = structuredClone(timing)
  }

  private nextRevision(): number {
    this.revision += 1
    return this.revision
  }

  private requireAdapter(): VitalPresetAdapter {
    if (this.adapter === null) throw new Error('Vital preset adapter is unavailable')
    return this.adapter
  }

  private requireHost(): VitalRendererHost {
    if (this.host === null) throw new Error('Vital audio host is unavailable')
    return this.host
  }

  private notify(): void {
    const state = this.getState()
    for (const subscriber of this.subscribers) subscriber(state)
  }
}

function isModulationPath(path: string): boolean {
  return (
    path.startsWith('lfo1.') ||
    path.startsWith('modEnvelope.') ||
    path === 'modulations' ||
    path.startsWith('filter.') ||
    /^oscillators\.(0|1|2)\.(enabled|level|wavetablePosition|transposeSemitones|fineTuneCents)$/.test(
      path,
    )
  )
}

function modulationTopologyChanged(before: PatchState, after: PatchState): boolean {
  if (before.modulations.length !== after.modulations.length) return true
  return before.modulations.some((route, index) => {
    const next = after.modulations[index]
    return next === undefined || route.source !== next.source || route.destination !== next.destination
  })
}

function latencyMilliseconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value * 1_000
    : null
}

function elapsedMilliseconds(start: number, end: number): number {
  return Math.max(0, end - start)
}
