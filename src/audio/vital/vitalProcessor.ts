import createVitalModule from 'virtual:vital-wasm-module'

import {
  VITAL_WORKLET_PROCESSOR_NAME,
  VITAL_WORKLET_PROTOCOL_VERSION,
  type VitalWorkletCommand,
  type VitalWorkletEvent,
} from './protocol'
import { VitalEngine } from './VitalEngine'
import type { VitalControlOperation } from '../../vital/VitalPresetAdapter'

const DEFAULT_MAX_BLOCK_FRAMES = 4_096
const HELD_NOTE_STATE_CROSSFADE_SECONDS = 0.04
const HELD_NOTE_STATE_WARMUP_SECONDS = 0.16
const TELEMETRY_INTERVAL_BLOCKS = 128
// Wavetable frames rendered per 128-frame quantum. Each costs ~0.4 ms in Chromium, so four keeps
// the load work at roughly half the 2.667 ms budget alongside normal rendering.
const WAVETABLE_FRAMES_PER_QUANTUM = 4
const OFFLINE_WAVETABLE_FRAMES_PER_STEP = 0x7fff_ffff

type StateTransitionPhase = 'idle' | 'beginning' | 'stepping' | 'warming' | 'crossfading'

interface AudioWorkletProcessorOptions {
  processorOptions?: unknown
}

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: AudioWorkletProcessorOptions)
}

declare function registerProcessor(
  name: string,
  processor: new (options?: AudioWorkletProcessorOptions) => AudioWorkletProcessor,
): void

declare const sampleRate: number

interface VitalProcessorOptions {
  initialControls?: PendingControlCommand[]
  initialState?: PendingState | null
  maxBlockFrames?: number
  protocolVersion: number
  realtime?: boolean
  wasmModule: WebAssembly.Module
}

type PendingControlCommand = Exclude<VitalWorkletCommand, { type: 'load-state' | 'dispose' }>

interface PendingState {
  json: string
  revision: number
}

class VitalProcessor extends AudioWorkletProcessor {
  private activeNoteCount = 0
  private readonly activeNoteFlags = new Uint8Array(128)
  private readonly activeNoteVelocities = new Float32Array(128)
  private bpm = 120
  private disposed = false
  private engine: VitalEngine | null = null
  private highestRequestedRevision = -1
  private readonly latestControlValues = new Map<
    string,
    { revision: number; value: number }
  >()
  private maxBlockFrames = DEFAULT_MAX_BLOCK_FRAMES
  private pendingControls: PendingControlCommand[] = []
  private pendingState: PendingState | null = null
  private renderBlockCount = 0
  private renderBlockMaxMs = 0
  private renderOverruns = 0
  private readonly renderStatsEvent: Extract<VitalWorkletEvent, { type: 'render-stats' }> = {
    type: 'render-stats',
    blockMs: 0,
    overruns: 0,
  }
  private reportedOutputError = false
  private standbyEngine: VitalEngine | null = null
  private stateFadeFrame = 0
  private stateFadeIn: Float32Array | null = null
  private stateFadeOut: Float32Array | null = null
  private readonly stateAppliedEvent: Extract<VitalWorkletEvent, { type: 'state-applied' }> = {
    type: 'state-applied',
    revision: 0,
    durationMs: 0,
  }
  private readonly controlsAppliedEvent: Extract<
    VitalWorkletEvent,
    { type: 'controls-applied' }
  > = {
    type: 'controls-applied',
    revision: 0,
    durationMs: 0,
  }
  private statePhase: StateTransitionPhase = 'idle'
  private stateTransitionLeft: Float32Array | null = null
  private stateTransitionRevision = -1
  private stateTransitionRight: Float32Array | null = null
  private stateTransitionJson: string | null = null
  private stateTransitionStartedAt = 0
  private stateWarmupFrames = 0
  private realtime = true

  constructor(options?: AudioWorkletProcessorOptions) {
    super()
    this.port.onmessage = (event: MessageEvent<unknown>) => this.handleCommand(event.data)
    this.port.start()
    void this.initialize(options?.processorOptions)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]
    const left = output?.[0]
    const right = output?.[1]
    if (left === undefined || right === undefined || left.length === 0) {
      if (!this.reportedOutputError) {
        this.reportedOutputError = true
        this.postEvent({
          type: 'error',
          phase: 'output',
          message: `Vital worklet requires stereo output; received ${output?.length ?? 0} channels`,
        })
      }
      return !this.disposed
    }

    if (this.disposed || this.engine === null) {
      clearOutput(left, right)
      return !this.disposed
    }

    const frames = left.length
    const startedAt = clockNowMs()
    try {
      this.applyPendingControls()
      this.beginPendingStateTransition()
      this.renderEngines(left, right, frames)
    } catch (error) {
      clearOutput(left, right)
      this.postError('process', error)
      this.disposeEngine()
      return false
    }

    this.recordRenderTelemetry(clockNowMs() - startedAt, frames)
    return true
  }

  private async initialize(value: unknown): Promise<void> {
    try {
      const options = parseProcessorOptions(value)
      this.maxBlockFrames = options.maxBlockFrames ?? DEFAULT_MAX_BLOCK_FRAMES
      this.realtime = options.realtime !== false
      prepareEmscriptenWorkerEnvironment()

      const createEngine = () =>
        VitalEngine.create(createVitalModule, sampleRate, {
          maxBlockFrames: this.maxBlockFrames,
          instantiateWasm: (imports, receiveInstance) => {
            const instance = new WebAssembly.Instance(options.wasmModule, imports)
            receiveInstance(instance, options.wasmModule)
            return instance.exports
          },
        })
      const engine = await createEngine()
      let standbyEngine: VitalEngine
      try {
        standbyEngine = await createEngine()
      } catch (error) {
        engine.dispose()
        throw error
      }

      if (this.disposed) {
        engine.dispose()
        standbyEngine.dispose()
        return
      }

      this.engine = engine
      this.standbyEngine = standbyEngine
      this.initializeRenderBuffers()
      if (options.initialState !== undefined && options.initialState !== null) {
        this.highestRequestedRevision = Math.max(
          this.highestRequestedRevision,
          options.initialState.revision,
        )
        const startedAt = clockNowMs()
        if (
          !engine.loadState(options.initialState.json) ||
          !standbyEngine.loadState(options.initialState.json)
        ) {
          throw new Error(`Vital rejected initial state revision ${options.initialState.revision}`)
        }
        this.emitStateApplied(options.initialState.revision, startedAt)
      }
      if (options.initialControls !== undefined) {
        for (const command of options.initialControls) this.pendingControls.push(command)
      }
      this.postEvent({ type: 'ready', sampleRate })
    } catch (error) {
      this.postError('initialize', error)
      this.disposeEngine()
    }
  }

  private handleCommand(value: unknown): void {
    if (!isCommandRecord(value) || this.disposed) return

    if (value.type === 'dispose') {
      this.disposeEngine()
      this.port.close()
      return
    }

    if (value.type === 'load-state') {
      if (
        !isNonNegativeSafeInteger(value.revision) ||
        typeof value.json !== 'string' ||
        value.json.length === 0 ||
        value.revision <= this.highestRequestedRevision
      ) {
        return
      }

      this.highestRequestedRevision = value.revision
      this.pendingState = { revision: value.revision, json: value.json }
      return
    }

    if (value.type === 'set-controls') {
      if (
        !isNonNegativeSafeInteger(value.revision) ||
        value.revision <= this.highestRequestedRevision ||
        !isVitalControlOperations(value.operations)
      ) {
        return
      }

      this.highestRequestedRevision = value.revision
      this.pendingControls.push(value as unknown as PendingControlCommand)
      return
    }

    this.pendingControls.push(value as unknown as PendingControlCommand)
  }

  private applyPendingControls(): void {
    const engine = this.engine
    if (engine === null) return

    for (let index = 0; index < this.pendingControls.length; index += 1) {
      const command = this.pendingControls[index]
      try {
        switch (command.type) {
          case 'set-controls': {
            const startedAt = clockNowMs()
            this.highestRequestedRevision = Math.max(
              this.highestRequestedRevision,
              command.revision,
            )
            this.applyControlOperations(engine, command.operations)
            for (const operation of command.operations) {
              this.latestControlValues.set(operation.name, {
                revision: command.revision,
                value: operation.value,
              })
            }
            if (this.isStandbyStateLoaded()) {
              const standby = this.standbyEngine
              if (standby !== null) this.applyControlOperations(standby, command.operations)
            }
            this.emitControlsApplied(command.revision, startedAt)
            break
          }
          case 'set-bpm':
            engine.setBpm(command.bpm)
            if (this.isMirroringToStandby()) this.standbyEngine?.setBpm(command.bpm)
            this.bpm = command.bpm
            break
          case 'note-on':
            engine.noteOn(command.note, command.velocity)
            if (this.isMirroringToStandby()) {
              this.standbyEngine?.noteOn(command.note, command.velocity)
            }
            if (this.activeNoteFlags[command.note] === 0) this.activeNoteCount += 1
            this.activeNoteFlags[command.note] = 1
            this.activeNoteVelocities[command.note] = command.velocity
            break
          case 'note-off':
            engine.noteOff(command.note)
            if (this.isMirroringToStandby()) this.standbyEngine?.noteOff(command.note)
            if (this.activeNoteFlags[command.note] !== 0) this.activeNoteCount -= 1
            this.activeNoteFlags[command.note] = 0
            this.activeNoteVelocities[command.note] = 0
            break
          case 'all-notes-off':
            engine.allNotesOff()
            if (this.isMirroringToStandby()) this.standbyEngine?.allNotesOff()
            this.activeNoteFlags.fill(0)
            this.activeNoteVelocities.fill(0)
            this.activeNoteCount = 0
            break
        }
      } catch (error) {
        this.postError(command.type, error)
      }
    }

    this.pendingControls.length = 0
  }

  /**
   * A full Vital state load is far too slow for one render quantum, so it is spread out.
   * `beginLoadState` still overruns by roughly 14 ms and is deliberately left uncovered; see
   * `06-phase3-state-load-cost-findings.md`. Offline rendering has no deadline and loads in one step.
   */
  private beginPendingStateTransition(): void {
    const state = this.pendingState
    if (this.standbyEngine === null || state === null || this.statePhase !== 'idle') return

    this.pendingState = null
    this.stateTransitionRevision = state.revision
    this.stateTransitionStartedAt = clockNowMs()
    this.stateTransitionJson = state.json
    this.statePhase = 'beginning'
  }

  private isMirroringToStandby(): boolean {
    return this.statePhase === 'warming' || this.statePhase === 'crossfading'
  }

  private isStandbyStateLoaded(): boolean {
    return (
      this.statePhase === 'stepping' ||
      this.statePhase === 'warming' ||
      this.statePhase === 'crossfading'
    )
  }

  private startStandbyLoad(): boolean {
    const target = this.standbyEngine
    const json = this.stateTransitionJson
    if (target === null || json === null) return false

    if (!target.beginLoadState(json)) {
      this.postEvent({
        type: 'error',
        phase: 'load-state',
        message: `Vital rejected state revision ${this.stateTransitionRevision}`,
      })
      return false
    }
    const replay: VitalControlOperation[] = []
    for (const [name, control] of this.latestControlValues) {
      if (control.revision > this.stateTransitionRevision) {
        replay.push({ name, value: control.value })
      } else {
        this.latestControlValues.delete(name)
      }
    }
    this.applyControlOperations(target, replay)
    return true
  }

  /** Returns true once every wavetable frame has been rendered. */
  private advanceStandbyLoad(frames: number): boolean {
    const target = this.standbyEngine
    if (target === null) return false

    const perQuantum = Math.max(
      2,
      Math.round((WAVETABLE_FRAMES_PER_QUANTUM * frames) / 128),
    )
    const remaining = target.stepLoadState(
      this.realtime ? perQuantum : OFFLINE_WAVETABLE_FRAMES_PER_STEP,
    )
    if (remaining > 0) return false

    target.finishLoadState()
    target.setBpm(this.bpm)
    for (let note = 0; note < this.activeNoteFlags.length; note += 1) {
      if (this.activeNoteFlags[note] !== 0) {
        target.noteOn(note, this.activeNoteVelocities[note])
      }
    }
    return true
  }

  private abortStateTransition(): void {
    this.statePhase = 'idle'
    this.stateTransitionJson = null
    this.stateTransitionRevision = -1
    this.stateTransitionStartedAt = 0
    this.stateWarmupFrames = 0
    this.stateFadeFrame = 0
  }

  private initializeRenderBuffers(): void {
    this.stateTransitionLeft = new Float32Array(this.maxBlockFrames)
    this.stateTransitionRight = new Float32Array(this.maxBlockFrames)

    const fadeFrames = Math.max(
      2,
      Math.ceil(HELD_NOTE_STATE_CROSSFADE_SECONDS * sampleRate) + 1,
    )
    this.stateFadeIn = new Float32Array(fadeFrames)
    this.stateFadeOut = new Float32Array(fadeFrames)
    for (let frame = 0; frame < fadeFrames; frame += 1) {
      const progress = frame / (fadeFrames - 1)
      const angle = (progress * Math.PI) / 2
      this.stateFadeIn[frame] = Math.sin(angle)
      this.stateFadeOut[frame] = Math.cos(angle)
    }
  }

  private renderEngines(left: Float32Array, right: Float32Array, frames: number): void {
    const engine = this.engine
    if (engine === null) return

    engine.process(frames)
    engine.copyStereoTo(left, right, frames)
    if (this.statePhase === 'idle') return

    const target = this.standbyEngine
    const transitionLeft = this.stateTransitionLeft
    const transitionRight = this.stateTransitionRight
    const fadeIn = this.stateFadeIn
    const fadeOut = this.stateFadeOut
    if (
      target === null ||
      transitionLeft === null ||
      transitionRight === null ||
      fadeIn === null ||
      fadeOut === null
    ) {
      throw new Error('Vital held-note state transition is unavailable')
    }

    switch (this.statePhase) {
      case 'beginning': {
        if (!this.startStandbyLoad()) {
          this.abortStateTransition()
          return
        }
        this.statePhase = 'stepping'
        return
      }

      case 'stepping':
        if (this.advanceStandbyLoad(frames)) this.enterWarmup()
        return

      case 'warming':
        target.process(frames)
        this.stateWarmupFrames = Math.max(0, this.stateWarmupFrames - frames)
        if (this.stateWarmupFrames === 0) this.statePhase = 'crossfading'
        return

      case 'crossfading': {
        target.process(frames)
        target.copyStereoTo(transitionLeft, transitionRight, frames)
        for (let frame = 0; frame < frames; frame += 1) {
          const fadeFrame = Math.min(this.stateFadeFrame, fadeIn.length - 1)
          left[frame] = left[frame] * fadeOut[fadeFrame] + transitionLeft[frame] * fadeIn[fadeFrame]
          right[frame] =
            right[frame] * fadeOut[fadeFrame] + transitionRight[frame] * fadeIn[fadeFrame]
          if (this.stateFadeFrame < fadeIn.length) this.stateFadeFrame += 1
        }
        if (this.stateFadeFrame >= fadeIn.length) this.completeStateTransition()
        return
      }
    }
  }

  private enterWarmup(): void {
    this.stateFadeFrame = 0
    this.stateWarmupFrames =
      this.activeNoteCount === 0 ? 0 : Math.ceil(HELD_NOTE_STATE_WARMUP_SECONDS * sampleRate)
    this.statePhase = this.stateWarmupFrames === 0 ? 'crossfading' : 'warming'
  }

  private completeStateTransition(): void {
    const revision = this.stateTransitionRevision
    const startedAt = this.stateTransitionStartedAt
    this.swapEngines()
    this.abortStateTransition()
    this.emitStateApplied(revision, startedAt)
  }

  private swapEngines(): void {
    const previousEngine = this.engine
    this.engine = this.standbyEngine
    this.standbyEngine = previousEngine
  }

  private recordRenderTelemetry(blockMs: number, frames: number): void {
    const quantumMs = (frames / sampleRate) * 1_000
    this.renderBlockCount += 1
    this.renderBlockMaxMs = Math.max(this.renderBlockMaxMs, blockMs)
    if (blockMs > quantumMs) this.renderOverruns += 1

    if (this.renderBlockCount < TELEMETRY_INTERVAL_BLOCKS) return

    this.renderStatsEvent.blockMs = this.renderBlockMaxMs
    this.renderStatsEvent.overruns = this.renderOverruns
    this.postEvent(this.renderStatsEvent)
    this.renderBlockCount = 0
    this.renderBlockMaxMs = 0
  }

  private emitStateApplied(revision: number, startedAt: number): void {
    this.stateAppliedEvent.revision = revision
    this.stateAppliedEvent.durationMs = clockNowMs() - startedAt
    this.postEvent(this.stateAppliedEvent)
  }

  private emitControlsApplied(revision: number, startedAt: number): void {
    this.controlsAppliedEvent.revision = revision
    this.controlsAppliedEvent.durationMs = clockNowMs() - startedAt
    this.postEvent(this.controlsAppliedEvent)
  }

  private applyControlOperations(engine: VitalEngine, operations: VitalControlOperation[]): void {
    for (const operation of operations) {
      if (!engine.setControl(operation.name, operation.value)) {
        throw new Error(`Vital rejected control ${operation.name}`)
      }
    }
  }

  private disposeEngine(): void {
    this.disposed = true
    this.activeNoteFlags.fill(0)
    this.activeNoteVelocities.fill(0)
    this.activeNoteCount = 0
    this.pendingState = null
    this.latestControlValues.clear()
    this.pendingControls.length = 0
    this.engine?.dispose()
    this.standbyEngine?.dispose()
    this.engine = null
    this.standbyEngine = null
    this.abortStateTransition()
  }

  private postError(phase: string, error: unknown): void {
    this.postEvent({ type: 'error', phase, message: toErrorMessage(error) })
  }

  private postEvent(event: VitalWorkletEvent): void {
    this.port.postMessage(event)
  }
}

function parseProcessorOptions(value: unknown): VitalProcessorOptions {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Vital worklet processor options are missing')
  }

  const options = value as Record<string, unknown>
  if (options.protocolVersion !== VITAL_WORKLET_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Vital worklet protocol version: ${String(options.protocolVersion)}`)
  }
  if (!(options.wasmModule instanceof WebAssembly.Module)) {
    throw new Error('Vital worklet did not receive a compiled WebAssembly module')
  }
  if (
    options.maxBlockFrames !== undefined &&
    (!Number.isInteger(options.maxBlockFrames) || Number(options.maxBlockFrames) <= 0)
  ) {
    throw new Error('Vital worklet maximum block size must be a positive integer')
  }

  return options as unknown as VitalProcessorOptions
}

function prepareEmscriptenWorkerEnvironment(): void {
  const scope = globalThis as unknown as {
    importScripts?: (...urls: string[]) => void
    location?: { href: string }
    self?: unknown
  }

  if (scope.self === undefined) scope.self = scope
  if (scope.location === undefined) scope.location = { href: 'vital-worklet.js' }
  if (scope.importScripts === undefined) {
    scope.importScripts = () => {
      throw new Error('Vital worklet does not support synchronous script imports')
    }
  }
}

function isCommandRecord(value: unknown): value is Record<string, unknown> & { type: string } {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isVitalControlOperations(value: unknown): value is VitalControlOperation[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (operation) =>
        typeof operation === 'object' &&
        operation !== null &&
        typeof (operation as { name?: unknown }).name === 'string' &&
        (operation as { name: string }).name.length > 0 &&
        typeof (operation as { value?: unknown }).value === 'number' &&
        Number.isFinite((operation as { value: number }).value),
    )
  )
}

function clearOutput(left: Float32Array, right: Float32Array): void {
  left.fill(0)
  right.fill(0)
}

function clockNowMs(): number {
  const scope = globalThis as unknown as { performance?: { now(): number } }
  return scope.performance?.now() ?? Date.now()
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

registerProcessor(VITAL_WORKLET_PROCESSOR_NAME, VitalProcessor)
