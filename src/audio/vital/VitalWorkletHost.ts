import processorUrl from './vitalProcessor.ts?worker&url'

import {
  isVitalWorkletEvent,
  VITAL_WORKLET_PROCESSOR_NAME,
  VITAL_WORKLET_PROTOCOL_VERSION,
  type VitalWorkletCommand,
  type VitalWorkletEvent,
} from './protocol'
import type { VitalControlOperation } from '../../vital/VitalPresetAdapter'

const DEFAULT_WASM_URL = '/wasm/vital/build/vital.wasm'
const DEFAULT_MAX_BLOCK_FRAMES = 4_096
const READY_TIMEOUT_MS = 30_000
const wasmModuleCache = new Map<string, Promise<WebAssembly.Module>>()

export interface VitalWorkletHostOptions {
  maxBlockFrames?: number
  processorUrl?: string
  wasmUrl?: string
}

export type VitalWorkletEventListener = (event: VitalWorkletEvent) => void

interface PendingStateCommand {
  json: string
  revision: number
}

interface PendingControlValue extends VitalControlOperation {
  revision: number
}

type PendingControlCommand = Exclude<
  VitalWorkletCommand,
  { type: 'load-state' | 'set-controls' | 'dispose' }
>
type InitialControlCommand = Exclude<VitalWorkletCommand, { type: 'load-state' | 'dispose' }>

export class VitalWorkletHost {
  private disposed = false
  private highestRequestedRevision = -1
  private initializePromise: Promise<void> | null = null
  private listeners = new Set<VitalWorkletEventListener>()
  private pendingControlRevision = -1
  private pendingControlValues = new Map<string, PendingControlValue>()
  private pendingControls: PendingControlCommand[] = []
  private pendingState: PendingStateCommand | null = null
  private pendingUpdateFlush = false
  private workletNode: AudioWorkletNode | null = null

  constructor(
    private readonly context: BaseAudioContext,
    private readonly options: VitalWorkletHostOptions = {},
  ) {}

  get node(): AudioWorkletNode {
    if (this.workletNode === null) throw new Error('Vital worklet host is not prepared')
    return this.workletNode
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  prepare(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Vital worklet host is disposed'))
    this.initializePromise ??= this.initialize()
    return this.initializePromise
  }

  subscribe(listener: VitalWorkletEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  loadState(revision: number, json: string): boolean {
    this.assertActive()
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new RangeError('Vital state revision must be a non-negative safe integer')
    }
    if (json.length === 0) throw new RangeError('Vital state JSON must not be empty')
    if (revision <= this.highestRequestedRevision) return false

    this.highestRequestedRevision = revision
    this.pendingState = { revision, json }
    for (const [name, operation] of this.pendingControlValues) {
      if (operation.revision <= revision) this.pendingControlValues.delete(name)
    }
    this.schedulePendingUpdateFlush()
    return true
  }

  setControls(revision: number, operations: VitalControlOperation[]): boolean {
    this.assertActive()
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new RangeError('Vital control revision must be a non-negative safe integer')
    }
    if (revision <= this.highestRequestedRevision) return false
    if (operations.length === 0) return false

    for (const operation of operations) {
      if (operation.name.length === 0) throw new RangeError('Vital control name must not be empty')
      if (!Number.isFinite(operation.value)) {
        throw new RangeError(`Vital control ${operation.name} must have a finite value`)
      }
    }

    this.highestRequestedRevision = revision
    this.pendingControlRevision = revision
    for (const operation of operations) {
      this.pendingControlValues.set(operation.name, { ...operation, revision })
    }
    this.schedulePendingUpdateFlush()
    return true
  }

  setBpm(bpm: number): void {
    this.postCommand({ type: 'set-bpm', bpm })
  }

  noteOn(note: number, velocity = 100 / 127): void {
    this.postCommand({ type: 'note-on', note, velocity })
  }

  noteOff(note: number): void {
    this.postCommand({ type: 'note-off', note })
  }

  allNotesOff(): void {
    this.postCommand({ type: 'all-notes-off' })
  }

  dispose(): void {
    if (this.disposed) return
    this.pendingState = null
    this.pendingControlValues.clear()
    this.pendingControls.length = 0
    this.disposed = true

    if (this.workletNode !== null) {
      this.workletNode.port.postMessage({ type: 'dispose' } satisfies VitalWorkletCommand)
      this.workletNode.disconnect()
      this.workletNode = null
    }
    this.listeners.clear()
  }

  private async initialize(): Promise<void> {
    const maxBlockFrames = this.options.maxBlockFrames ?? DEFAULT_MAX_BLOCK_FRAMES
    if (!Number.isInteger(maxBlockFrames) || maxBlockFrames <= 0) {
      throw new RangeError('Vital maximum worklet block size must be a positive integer')
    }

    try {
      const [wasmModule] = await Promise.all([
        getCompiledWasmModule(this.options.wasmUrl ?? DEFAULT_WASM_URL),
        this.context.audioWorklet.addModule(this.options.processorUrl ?? processorUrl),
      ])
      if (this.disposed) throw new Error('Vital worklet host was disposed during initialization')

      const initialState = this.pendingState
      const initialControls: InitialControlCommand[] = [...this.pendingControls]
      const initialControlUpdate = this.takePendingControlCommand(initialState?.revision ?? -1)
      if (initialControlUpdate !== null) initialControls.push(initialControlUpdate)
      this.pendingState = null
      this.pendingControls = []
      this.pendingUpdateFlush = false

      const node = new AudioWorkletNode(this.context, VITAL_WORKLET_PROCESSOR_NAME, {
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          maxBlockFrames,
          initialControls,
          initialState,
          protocolVersion: VITAL_WORKLET_PROTOCOL_VERSION,
          realtime: typeof AudioContext !== 'undefined' && this.context instanceof AudioContext,
          wasmModule,
        },
      })
      this.workletNode = node
      node.addEventListener('processorerror', () => {
        this.emit({
          type: 'error',
          phase: 'processor',
          message: 'Vital AudioWorkletProcessor stopped because of an uncaught exception',
        })
      })

      // Instantiating the WASM module and constructing both engines runs as a microtask on the
      // render thread, so it stalls that thread for tens of milliseconds. Stay out of the graph
      // until the processor reports readiness: an underrun while nothing is connected produces
      // silence, whereas the same stall on a connected node is an audible dropout at first play.
      await this.waitForReady(node)
      if (this.disposed) throw new Error('Vital worklet host was disposed during initialization')
      node.connect(this.context.destination)
    } catch (error) {
      this.emit({ type: 'error', phase: 'host-initialize', message: toErrorMessage(error) })
      throw error
    }
  }

  private waitForReady(node: AudioWorkletNode): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error('Vital worklet initialization timed out'))
      }, READY_TIMEOUT_MS)

      node.port.onmessage = (message: MessageEvent<unknown>) => {
        if (!isVitalWorkletEvent(message.data)) return
        const event = message.data
        this.emit(event)

        if (event.type === 'ready') {
          globalThis.clearTimeout(timeout)
          resolve()
        } else if (event.type === 'error' && event.phase === 'initialize') {
          globalThis.clearTimeout(timeout)
          reject(new Error(event.message))
        }
      }
      node.port.start()
    })
  }

  private flushPendingUpdates(): void {
    this.pendingUpdateFlush = false
    const state = this.pendingState
    this.pendingState = null
    if (this.disposed || this.workletNode === null) return

    if (state !== null) {
      this.workletNode.port.postMessage({
        type: 'load-state',
        revision: state.revision,
        json: state.json,
      } satisfies VitalWorkletCommand)
    }

    const controls = this.takePendingControlCommand(state?.revision ?? -1)
    if (controls !== null) this.workletNode.port.postMessage(controls)
  }

  private postCommand(command: VitalWorkletCommand): void {
    this.assertActive()
    if (this.workletNode === null) {
      this.pendingControls.push(command as PendingControlCommand)
      return
    }
    this.workletNode.port.postMessage(command)
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Vital worklet host is disposed')
  }

  private emit(event: VitalWorkletEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private schedulePendingUpdateFlush(): void {
    if (this.workletNode === null || this.pendingUpdateFlush) return
    this.pendingUpdateFlush = true
    queueMicrotask(() => this.flushPendingUpdates())
  }

  private takePendingControlCommand(afterRevision: number): Extract<
    VitalWorkletCommand,
    { type: 'set-controls' }
  > | null {
    const operations: VitalControlOperation[] = []
    for (const [name, operation] of this.pendingControlValues) {
      if (operation.revision > afterRevision) {
        operations.push({ name, value: operation.value })
      }
    }
    this.pendingControlValues.clear()
    if (operations.length === 0) return null

    return {
      type: 'set-controls',
      revision: this.pendingControlRevision,
      operations,
    }
  }
}

export function preloadVitalWasm(wasmUrl = DEFAULT_WASM_URL): Promise<WebAssembly.Module> {
  return getCompiledWasmModule(wasmUrl)
}

function getCompiledWasmModule(url: string): Promise<WebAssembly.Module> {
  const cached = wasmModuleCache.get(url)
  if (cached !== undefined) return cached

  const pending = compileWasmModule(url).catch((error: unknown) => {
    wasmModuleCache.delete(url)
    throw error
  })
  wasmModuleCache.set(url, pending)
  return pending
}

async function compileWasmModule(url: string): Promise<WebAssembly.Module> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Vital WASM request failed (${response.status} ${response.statusText})`)
  }

  if (typeof WebAssembly.compileStreaming === 'function') {
    try {
      return await WebAssembly.compileStreaming(Promise.resolve(response.clone()))
    } catch {
      // Fall through for development servers that do not provide application/wasm.
    }
  }

  return WebAssembly.compile(await response.arrayBuffer())
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
