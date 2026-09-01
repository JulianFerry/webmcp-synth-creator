import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VitalWasmRenderer, type VitalRendererHost } from '../../src/audio/vital/VitalWasmRenderer'
import type { VitalWorkletEvent } from '../../src/audio/vital/protocol'
import type { VitalWorkletEventListener } from '../../src/audio/vital/VitalWorkletHost'
import { CommandService } from '../../src/commands/CommandService'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { encodeVitalEffectOrder } from '../../src/vital/effectOrder'
import { SessionService } from '../../src/session/SessionService'
import {
  VitalPresetAdapter,
  type VitalControlOperation,
} from '../../src/vital/VitalPresetAdapter'

interface RecordedUpdate {
  revision: number
  operations: VitalControlOperation[]
}

class FakeVitalHost implements VitalRendererHost {
  readonly calls: string[] = []
  readonly controlUpdates: RecordedUpdate[] = []
  disposed = false
  highestRevision = -1
  readonly listeners = new Set<VitalWorkletEventListener>()
  readonly stateUpdates: Array<{ revision: number; json: string }> = []

  async prepare(): Promise<void> {
    this.calls.push('prepare')
    this.emit({ type: 'ready', sampleRate: 48_000 })
  }

  subscribe(listener: VitalWorkletEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  loadState(revision: number, json: string): boolean {
    if (revision <= this.highestRevision) return false
    this.highestRevision = revision
    this.stateUpdates.push({ revision, json })
    this.calls.push(`state:${revision}`)
    return true
  }

  setControls(revision: number, operations: VitalControlOperation[]): boolean {
    if (revision <= this.highestRevision) return false
    this.highestRevision = revision
    this.controlUpdates.push({ revision, operations: structuredClone(operations) })
    this.calls.push(`controls:${revision}`)
    return true
  }

  setBpm(bpm: number): void {
    this.calls.push(`bpm:${bpm}`)
  }

  noteOn(note: number, velocity = 100 / 127): void {
    this.calls.push(`on:${note}:${velocity}`)
  }

  noteOff(note: number): void {
    this.calls.push(`off:${note}`)
  }

  allNotesOff(): void {
    this.calls.push('all-off')
  }

  dispose(): void {
    this.disposed = true
    this.calls.push('dispose')
    this.listeners.clear()
  }

  emit(event: VitalWorkletEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

class FakeRendererAudioContext {
  baseLatency = 0.005
  currentTime = 0
  readonly destination = {}
  sampleRate = 48_000
  state: AudioContextState = 'suspended'
  private readonly stateListeners = new Set<() => void>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'statechange') return
    this.stateListeners.add(() => {
      if (typeof listener === 'function') listener(new Event('statechange'))
      else listener.handleEvent(new Event('statechange'))
    })
  }

  async resume(): Promise<void> {
    this.state = 'running'
    for (const listener of this.stateListeners) listener()
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext
  }
}

function createAdapter(): VitalPresetAdapter {
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
  ) as unknown
  return new VitalPresetAdapter(fixture)
}

function createHarness(options: { preloadWasm?: () => Promise<unknown> } = {}) {
  let now = 0
  let audioContextCreations = 0
  let hostCreations = 0
  const trace = new LatencyTrace(false, () => {
    now += 1
    return now
  })
  const session = new SessionService(createDefaultPatch())
  const commands = new CommandService(session, undefined, trace)
  const adapter = createAdapter()
  const context = new FakeRendererAudioContext()
  const host = new FakeVitalHost()
  const renderer = new VitalWasmRenderer(session, adapter, trace, {
    createAudioContext: () => {
      audioContextCreations += 1
      return context.asAudioContext()
    },
    createHost: () => {
      hostCreations += 1
      return host
    },
    performanceNow: () => {
      now += 1
      return now
    },
    preloadWasm: options.preloadWasm ?? (() => Promise.resolve()),
  })
  return {
    adapter,
    commands,
    context,
    creationCounts: () => ({ audioContextCreations, hostCreations }),
    host,
    renderer,
    session,
    trace,
  }
}

describe('VitalWasmRenderer', () => {
  it('preloads without creating audio and starts the host only from note-on', async () => {
    const { context, creationCounts, host, renderer } = createHarness()

    await renderer.prepare()
    expect(creationCounts()).toEqual({ audioContextCreations: 0, hostCreations: 0 })
    expect(context.state).toBe('suspended')
    expect(renderer.getState().lifecycle).toBe('suspended')
    expect(host.calls).toEqual([])

    await renderer.noteOn(60, 0.7)
    expect(creationCounts()).toEqual({ audioContextCreations: 1, hostCreations: 1 })
    expect(context.state).toBe('running')
    expect(host.calls.slice(0, 4)).toEqual(['bpm:120', 'state:1', 'prepare', 'on:60:0.7'])
    expect(renderer.getState()).toMatchObject({
      activeNotes: [60],
      activeVoiceCount: 1,
      lifecycle: 'running',
    })

    renderer.noteOff(60)
    expect(host.calls.at(-1)).toBe('off:60')
    renderer.dispose()
  })

  it('uses adapter-derived controls for scalar previews and reserves state loads for resources', async () => {
    const { adapter, commands, host, renderer, session } = createHarness()
    await renderer.prepare()
    await renderer.startAudio()

    expect(host.calls.slice(0, 3)).toEqual(['bpm:120', 'state:1', 'prepare'])
    const initialState = host.stateUpdates[0]
    expect(initialState.json).toBe(adapter.exportPatch(session.getPatch()).json)

    const beforePreview = session.getPatch()
    expect(renderer.previewPatchChange('filter.cutoffHz', 2_400)).toBe(true)
    const afterPreview = structuredClone(beforePreview)
    afterPreview.filter.cutoffHz = 2_400
    expect(host.controlUpdates.at(-1)?.operations).toEqual(
      adapter.controlOperations(beforePreview, afterPreview),
    )
    expect(host.stateUpdates).toHaveLength(1)
    expect(renderer.getState().effective.filter.cutoffHz).toBe(2_400)
    expect(session.getPatch().filter.cutoffHz).toBe(7_200)

    renderer.cancelPatchPreview('filter.cutoffHz')
    expect(host.controlUpdates.at(-1)?.operations).toEqual(
      adapter.controlOperations(afterPreview, beforePreview),
    )

    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Disable LFO routing through scalar bypass controls',
        changes: [{ path: 'lfo1.enabled', value: false }],
      },
      { source: 'webmcp' },
    )
    expect(host.controlUpdates.at(-1)?.operations).toContainEqual({
      name: 'modulation_1_bypass',
      value: 1,
    })
    expect(host.stateUpdates).toHaveLength(1)

    const modulations = structuredClone(beforePreview.modulations)
    modulations[0].amount = Number((modulations[0].amount - 0.1).toFixed(2))
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Change one modulation amount without rebuilding resources',
        changes: [{ path: 'modulations', value: modulations }],
      },
      { source: 'webmcp' },
    )
    expect(host.controlUpdates.at(-1)?.operations).toContainEqual({
      name: 'modulation_1_amount',
      value: modulations[0].amount,
    })
    expect(host.stateUpdates).toHaveLength(1)

    const points = structuredClone(session.getPatch().lfo1.points)
    points[1].x = Number((points[1].x + 0.01).toFixed(2))
    commands.setLfoShape(
      { type: 'set_lfo_shape', reason: 'Change one LFO resource', points },
      { source: 'webmcp' },
    )
    expect(host.stateUpdates).toHaveLength(2)
    expect(host.stateUpdates.at(-1)?.json).toBe(adapter.exportPatch(session.getPatch()).json)
    expect(renderer.getState().previewValues).toEqual({})
    renderer.dispose()
  })

  it('reflects and cancels oscillator 3 previews without changing canonical state', async () => {
    const { adapter, host, renderer, session } = createHarness()
    await renderer.startAudio()

    const committed = session.getPatch()
    expect(renderer.getState().oscillators).toHaveLength(3)
    expect(renderer.getState().effects.order).toHaveLength(6)
    expect(renderer.previewPatchChange('oscillators.2.wavetablePosition', 0.73)).toBe(true)

    const previewed = structuredClone(committed)
    previewed.oscillators[2].wavetablePosition = 0.73
    expect(host.controlUpdates.at(-1)?.operations).toEqual(
      adapter.controlOperations(committed, previewed),
    )
    expect(renderer.getState()).toMatchObject({
      previewWavetablePositions: [null, null, 0.73],
      oscillators: [
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ wavetablePosition: 0.73 }),
      ],
      draft: {
        oscillators: [
          expect.any(Object),
          expect.any(Object),
          expect.objectContaining({ wavetablePosition: 0.73 }),
        ],
      },
      effective: {
        oscillators: [
          expect.any(Object),
          expect.any(Object),
          expect.objectContaining({ wavetablePosition: 0.73 }),
        ],
      },
    })
    expect(session.getPatch().oscillators[2].wavetablePosition).toBe(
      committed.oscillators[2].wavetablePosition,
    )

    renderer.cancelPatchPreview('oscillators.2.wavetablePosition')
    expect(host.controlUpdates.at(-1)?.operations).toEqual(
      adapter.controlOperations(previewed, committed),
    )
    expect(renderer.getState().previewWavetablePositions).toEqual([null, null, null])
    expect(renderer.getState().effective.oscillators[2].wavetablePosition).toBe(
      committed.oscillators[2].wavetablePosition,
    )
    renderer.dispose()
  })

  it('uses controls for oscillator 3 scalars and full state for its wavetable identity', async () => {
    const { adapter, commands, host, renderer, session } = createHarness()
    await renderer.startAudio()
    await renderer.noteOn(60)

    const beforeScalar = session.getPatch()
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Raise oscillator 3 level',
        changes: [{ path: 'oscillators.2.level', value: 0.41 }],
      },
      { source: 'ui' },
    )
    const afterScalar = session.getPatch()
    const scalarUpdate = host.controlUpdates.at(-1)
    expect(scalarUpdate?.operations).toEqual(adapter.controlOperations(beforeScalar, afterScalar))
    expect(scalarUpdate?.operations).toContainEqual({
      name: 'osc_3_level',
      value: expect.any(Number),
    })
    expect(host.stateUpdates).toHaveLength(1)

    host.emit({
      type: 'controls-applied',
      revision: scalarUpdate!.revision,
      durationMs: 0.01,
    })
    expect(renderer.getState().modulationScheduleVersion).toBe(1)
    expect(renderer.getState().effective.oscillators[2].level).toBe(0.41)

    const controlUpdateCount = host.controlUpdates.length
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Replace oscillator 3 wavetable resource',
        changes: [{ path: 'oscillators.2.wavetableId', value: 'sine' }],
      },
      { source: 'ui' },
    )
    expect(host.controlUpdates).toHaveLength(controlUpdateCount)
    expect(host.stateUpdates).toHaveLength(2)
    expect(host.stateUpdates.at(-1)?.json).toBe(adapter.exportPatch(session.getPatch()).json)
    renderer.dispose()
  })

  it('applies filter types and effect order as scalar controls without reloading state', async () => {
    const { commands, host, renderer, session } = createHarness()
    await renderer.startAudio()

    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Use a high-pass FX filter',
        changes: [{ path: 'filter.type', value: 'highpass' }],
      },
      { source: 'ui' },
    )
    expect(host.controlUpdates.at(-1)?.operations).toContainEqual({
      name: 'filter_fx_blend',
      value: 2,
    })
    expect(host.stateUpdates).toHaveLength(1)

    const order = ['reverb', 'delay', 'filter', 'chorus', 'compressor', 'distortion'] as const
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Move reverb to the front of the Vital chain',
        changes: [{ path: 'effects.order', value: [...order] }],
      },
      { source: 'ui' },
    )
    expect(host.controlUpdates.at(-1)?.operations).toEqual([
      { name: 'effect_chain_order', value: encodeVitalEffectOrder(order) },
    ])
    expect(host.stateUpdates).toHaveLength(1)
    expect(session.getPatch().effects.order).toEqual(order)
    renderer.dispose()
  })

  it('keeps newest revisions, ignores stale acknowledgements, and coalesces modulation reflection', async () => {
    const { commands, host, renderer } = createHarness()
    await renderer.startAudio()
    await renderer.noteOn(60)

    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'First modulation-affecting scalar update',
        changes: [{ path: 'filter.cutoffHz', value: 3_200 }],
      },
      { source: 'webmcp' },
    )
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Newest modulation-affecting scalar update',
        changes: [{ path: 'filter.cutoffHz', value: 2_800 }],
      },
      { source: 'webmcp' },
    )

    const [older, newest] = host.controlUpdates.slice(-2)
    expect(newest.revision).toBeGreaterThan(older.revision)
    expect(host.setControls(older.revision, older.operations)).toBe(false)
    host.emit({ type: 'controls-applied', revision: older.revision, durationMs: 0.01 })
    expect(renderer.getState().modulationScheduleVersion).toBe(0)
    host.emit({ type: 'controls-applied', revision: newest.revision, durationMs: 0.01 })
    expect(renderer.getState().modulationScheduleVersion).toBe(1)
    renderer.dispose()
  })

  it('orders note replacement, polyphony stealing, release, and disposal through the host', async () => {
    const { commands, context, host, renderer } = createHarness()
    await renderer.noteOn(60, 0.5)
    await renderer.noteOn(60, 0.75)
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Limit audition to one voice',
        changes: [{ path: 'voice.polyphony', value: 1 }],
      },
      { source: 'ui' },
    )
    await renderer.noteOn(64, 0.8)

    expect(host.calls).toContain('on:60:0.5')
    expect(host.calls.indexOf('off:60')).toBeLessThan(host.calls.indexOf('on:60:0.75'))
    expect(host.calls.lastIndexOf('off:60')).toBeLessThan(host.calls.indexOf('on:64:0.8'))
    expect(renderer.getState()).toMatchObject({
      activeNotes: [64],
      activeVoiceCount: 1,
      polyphony: 1,
      stolenVoiceCount: 1,
    })

    renderer.releaseAllNotes()
    expect(host.calls.at(-1)).toBe('all-off')
    expect(renderer.getState()).toMatchObject({ activeNotes: [], activeVoiceCount: 0 })
    renderer.dispose()
    expect(host.calls.slice(-2)).toEqual(['all-off', 'dispose'])
    expect(host.disposed).toBe(true)
    expect(context.state).toBe('closed')
  })

  it('forwards note, chord, and arpeggiator schedules in UI order', async () => {
    const { host, renderer } = createHarness()
    await renderer.startAudio()

    await renderer.noteOn(60, 1)
    renderer.releaseAllNotes()

    await Promise.all([60, 63, 67].map((note) => renderer.noteOn(note, 1)))
    renderer.releaseAllNotes()

    await renderer.noteOn(60, 1)
    renderer.releaseAllNotes()
    await renderer.noteOn(63, 1)

    expect(
      host.calls.filter((call) => call === 'all-off' || call.startsWith('on:')),
    ).toEqual([
      'on:60:1',
      'all-off',
      'on:60:1',
      'on:63:1',
      'on:67:1',
      'all-off',
      'on:60:1',
      'all-off',
      'on:63:1',
    ])
    expect(renderer.getState()).toMatchObject({ activeNotes: [63], activeVoiceCount: 1 })
    renderer.dispose()
  })

  it('propagates worklet errors to renderer state subscribers', async () => {
    const { host, renderer } = createHarness()
    const lifecycles: string[] = []
    renderer.subscribe((state) => lifecycles.push(state.lifecycle))
    await renderer.startAudio()

    host.emit({ type: 'error', phase: 'process', message: 'render failed' })

    expect(renderer.getState().lifecycle).toBe('error')
    expect(lifecycles).toContain('error')
    renderer.dispose()
  })

  it('surfaces preparation failure without constructing a host', async () => {
    const { creationCounts, host, renderer } = createHarness({
      preloadWasm: () => Promise.reject(new Error('missing wasm')),
    })

    await expect(renderer.prepare()).rejects.toThrow('missing wasm')
    expect(renderer.getState().lifecycle).toBe('error')
    expect(creationCounts()).toEqual({ audioContextCreations: 0, hostCreations: 0 })
    expect(host.calls).toEqual([])
    renderer.dispose()
  })
})
