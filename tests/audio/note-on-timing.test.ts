import { afterEach, describe, expect, it } from 'vitest'

import { BrowserSynth } from '../../src/audio/BrowserSynth'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { CALIBRATION_D_PATCH } from '../../src/presets/patches/calibration'
import { SessionService } from '../../src/session/SessionService'
import { FakeAudioContext } from './fakes'

afterEach(() => {
  delete (
    globalThis as typeof globalThis & {
      __WAVETABLE_WORKBENCH_NOTE_TIMING__?: unknown
    }
  ).__WAVETABLE_WORKBENCH_NOTE_TIMING__
})

describe('note-on timing measurement', () => {
  it('sets a new voice oscillator level immediately instead of creating an attack bounce', async () => {
    const context = new FakeAudioContext()
    const synth = new BrowserSynth(
      new SessionService(CALIBRATION_D_PATCH),
      new LatencyTrace(false),
      () => context.asAudioContext(),
    )

    await synth.noteOn(48)

    const oscillatorOneLevel = context.gains.at(-2)!.gain
    const targetCall = oscillatorOneLevel.calls.find(
      (call) => call.value !== undefined && Math.abs(call.value - 0.24) < 1e-8,
    )
    expect(targetCall).toEqual({ method: 'set', value: 0.24, time: 0 })
    expect(
      oscillatorOneLevel.calls.some(
        (call) =>
          call.method === 'linearRamp' &&
          Math.abs((call.value ?? 0) - 0.24) < 1e-8 &&
          Math.abs((call.time ?? 0) - 0.01) < 1e-8,
      ),
    ).toBe(false)
    synth.dispose()
  })

  it('does not republish unchanged running state before every note', async () => {
    const context = new FakeAudioContext()
    const synth = new BrowserSynth(
      new SessionService(createDefaultPatch()),
      new LatencyTrace(false),
      () => context.asAudioContext(),
    )
    const lifecycleUpdates: string[] = []
    synth.subscribe((state) => lifecycleUpdates.push(state.lifecycle))

    await synth.startAudio()
    await synth.startAudio()

    expect(lifecycleUpdates).toEqual(['running'])
    synth.dispose()
  })

  it('separates audio readiness, voice construction, output timing, and envelope thresholds', async () => {
    const context = new FakeAudioContext()
    context.currentTime = 5
    Object.assign(context, {
      baseLatency: 0.006,
      outputLatency: 0.012,
      getOutputTimestamp: () => ({ contextTime: 4.99, performanceTime: 1_000 }),
    })
    const clockSamples = [1_002, 1_003, 1_008, 1_009]
    const synth = new BrowserSynth(
      new SessionService(createDefaultPatch()),
      new LatencyTrace(false),
      () => context.asAudioContext(),
      () => clockSamples.shift() ?? 1_009,
    )

    await synth.noteOn(48, 0.85, 1_000)

    const timing = synth.getState().lastNoteOnTiming
    expect(timing).not.toBeNull()
    expect(timing).toMatchObject({
      midi: 48,
      velocity: 0.85,
      audioReadyMs: 2,
      voiceGraphBuildMs: 5,
      inputToVoiceReadyMs: 9,
      baseLatencyMs: 6,
      outputLatencyMs: 12,
      attackMs: 180,
      estimateSource: 'output-timestamp',
    })
    expect(timing!.renderQuantumMs).toBeCloseTo(2.667, 3)
    expect(timing!.estimatedFirstSampleMs).toBeCloseTo(12.667, 3)
    expect(timing!.estimatedEnvelopeMinus40DbMs).toBeCloseTo(14.467, 3)
    expect(timing!.estimatedEnvelopeMinus20DbMs).toBeCloseTo(30.667, 3)
    expect(
      (
        globalThis as typeof globalThis & {
          __WAVETABLE_WORKBENCH_NOTE_TIMING__?: { midi: number }
        }
      ).__WAVETABLE_WORKBENCH_NOTE_TIMING__?.midi,
    ).toBe(48)

    synth.dispose()
  })
})
