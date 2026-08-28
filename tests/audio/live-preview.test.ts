import { describe, expect, it } from 'vitest'

import { createAppStore } from '../../src/app/appStore'
import { BrowserSynth } from '../../src/audio/BrowserSynth'
import { resonanceToQ } from '../../src/audio/filter'
import { transposeFrequency, velocityToGain } from '../../src/audio/units'
import { CommandService } from '../../src/commands/CommandService'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionService } from '../../src/session/SessionService'
import {
  FakeAudioContext,
  type FakeAudioParam,
  type FakeGainNode,
} from './fakes'

function createHarness() {
  let now = 0
  const trace = new LatencyTrace(true, () => {
    now += 1
    return now
  })
  const session = new SessionService(createDefaultPatch())
  const context = new FakeAudioContext()
  const synth = new BrowserSynth(session, trace, () => context.asAudioContext())
  const commands = new CommandService(session, undefined, trace)
  const store = createAppStore({ session, commands, synth })
  return { commands, context, session, store, synth, trace }
}

function hasRamp(parameter: FakeAudioParam, value: number, time?: number): boolean {
  return parameter.calls.some(
    (call) =>
      (call.method === 'linearRamp' || call.method === 'exponentialRamp') &&
      Math.abs((call.value ?? Number.NaN) - value) < 1e-8 &&
      (time === undefined || Math.abs(call.time - time) < 1e-8),
  )
}

describe('held-note slider preview', () => {
  it('keeps a whole-Hz cutoff preview isolated and commits it exactly once', async () => {
    const { commands, context, session, store, synth, trace } = createHarness()
    await synth.holdNote()
    const filter = context.filters[0]

    store.getState().previewPatchChange('filter.cutoffHz', 632)

    expect(hasRamp(filter.frequency, 632)).toBe(true)
    expect(synth.getState().draft.filter.cutoffHz).toBe(632)
    expect(synth.getState().effective.filter.cutoffHz).toBe(632)
    expect(session.getPatch().filter.cutoffHz).toBe(7_200)
    expect(commands.historySize).toBe(0)
    expect(store.getState().transactionCount).toBe(0)
    expect(trace.getEvents()).toEqual([])

    expect(
      store.getState().applyPatchChange('filter.cutoffHz', 632, 'Commit cutoff gesture'),
    ).toBe(true)

    expect(session.getPatch().filter.cutoffHz).toBe(632)
    expect(synth.getState().effective.filter.cutoffHz).toBe(632)
    expect(synth.getState().previewValues).toEqual({})
    expect(commands.historySize).toBe(1)
    expect(store.getState().transactionCount).toBe(1)
    expect(trace.getEvents().map((event) => event.stage)).toEqual([
      'request_received',
      'patch_committed',
      'audio_diff_applied',
    ])
    synth.dispose()
  })

  it('updates active oscillator, unison, filter, and sustain nodes before one commit', async () => {
    const { commands, context, session, store, synth, trace } = createHarness()
    await synth.holdNote()

    const filter = context.filters[0]
    const amplitude = (filter.connections[0] as FakeGainNode).gain
    const oscillatorOneLevel = context.gains.at(-2)!.gain
    const oscillatorOneLanes = context.oscillators.slice(0, 10)
    const initialWaveAssignments = oscillatorOneLanes.map((oscillator) => oscillator.waves.length)
    const expectedVelocityGain = velocityToGain(0.85, 0.3)

    store.getState().previewPatchChange('oscillators.0.level', 0.2)
    expect(hasRamp(oscillatorOneLevel, 0.2 * expectedVelocityGain * 0.24)).toBe(true)

    store.getState().previewPatchChange('oscillators.0.fineTuneCents', 17)
    const previewFrequency = transposeFrequency(60, 0, 17)
    expect(
      oscillatorOneLanes.every((oscillator) => hasRamp(oscillator.frequency, previewFrequency)),
    ).toBe(true)

    store.getState().previewPatchChange('oscillators.0.wavetablePosition', 0.31)
    expect(
      oscillatorOneLanes.every(
        (oscillator, index) => oscillator.waves.length > initialWaveAssignments[index],
      ),
    ).toBe(true)

    store.getState().previewPatchChange('oscillators.0.unisonDetune', 0.72)
    store.getState().previewPatchChange('oscillators.0.stereoSpread', 0.44)
    expect(oscillatorOneLanes.some((oscillator) => oscillator.detune.calls.some((call) => call.method === 'linearRamp'))).toBe(true)
    expect(context.panners.slice(0, 5).some((panner) => hasRamp(panner.pan, 0.44))).toBe(true)

    const oscillatorCountBeforeUnisonPreview = context.oscillators.length
    const pannerCountBeforeUnisonPreview = context.panners.length
    const previousGroupOutput = context.panners[0].connections[0] as FakeGainNode
    store.getState().previewPatchChange('oscillators.0.unisonVoices', 3)
    expect(context.oscillators.length - oscillatorCountBeforeUnisonPreview).toBe(6)
    expect(oscillatorOneLanes.every((oscillator) => oscillator.stops.includes(0.03))).toBe(true)
    expect(hasRamp(previousGroupOutput.gain, 0, 0.02)).toBe(true)
    const nextGroupOutput = context.panners[pannerCountBeforeUnisonPreview]
      .connections[0] as FakeGainNode
    expect(hasRamp(nextGroupOutput.gain, 1, 0.02)).toBe(true)

    store.getState().previewPatchChange('filter.cutoffHz', 2_400)
    store.getState().previewPatchChange('filter.resonance', 0.65)
    expect(hasRamp(filter.frequency, 2_400)).toBe(true)
    expect(hasRamp(filter.Q, resonanceToQ(0.65))).toBe(true)

    amplitude.calls.length = 0
    store.getState().previewPatchChange('ampEnvelope.sustainLevel', 0.4)
    expect(hasRamp(amplitude, 0.4, 0.02)).toBe(true)

    expect(session.getPatch().oscillators[0].level).toBe(0.62)
    expect(session.getPatch().filter.cutoffHz).toBe(7_200)
    expect(commands.historySize).toBe(0)
    expect(store.getState().transactionCount).toBe(0)
    expect(trace.getEvents()).toEqual([])

    expect(
      store
        .getState()
        .applyPatchChange('oscillators.0.level', 0.2, 'Commit oscillator level gesture'),
    ).toBe(true)

    expect(session.getPatch().oscillators[0].level).toBe(0.2)
    expect(session.getPatch().filter.cutoffHz).toBe(7_200)
    expect(synth.getState().previewValues).toEqual({})
    expect(commands.historySize).toBe(1)
    expect(store.getState().transactionCount).toBe(1)
    expect(trace.getEvents().map((event) => event.stage)).toEqual([
      'request_received',
      'patch_committed',
      'audio_diff_applied',
    ])
    synth.dispose()
  })

  it('reconciles active nodes after cancellation, external update, and undo', async () => {
    const { commands, context, session, store, synth } = createHarness()
    await synth.holdNote()
    const oscillatorOneLevel = context.gains.at(-2)!.gain
    const filter = context.filters[0]

    store.getState().previewPatchChange('oscillators.0.level', 0.18)
    store.getState().previewPatchChange('filter.cutoffHz', 1_800)
    store.getState().cancelPatchPreview('oscillators.0.level')
    store.getState().cancelPatchPreview('filter.cutoffHz')

    expect(hasRamp(oscillatorOneLevel, 0.62 * velocityToGain(0.85, 0.3) * 0.24)).toBe(true)
    expect(hasRamp(filter.frequency, 7_200)).toBe(true)
    expect(synth.getState().previewValues).toEqual({})
    expect(commands.historySize).toBe(0)

    store.getState().previewPatchChange('oscillators.0.fineTuneCents', 26)
    store.getState().previewPatchChange('filter.cutoffHz', 2_000)
    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'External resonance update',
        changes: [{ path: 'filter.resonance', value: 0.6 }],
      },
      { source: 'webmcp' },
    )

    expect(synth.getState().previewValues).toEqual({})
    expect(synth.getState().effective.oscillators[0].fineTuneCents).toBe(0)
    expect(synth.getState().effective.filter.cutoffHz).toBe(7_200)
    expect(filter.frequency.value).toBeGreaterThan(0)
    expect(filter.frequency.value).toBeLessThanOrEqual(7_200)
    expect(filter.Q.value).toBe(resonanceToQ(0.6))

    store.getState().previewPatchChange('oscillators.0.level', 0.25)
    commands.undo({ source: 'history' })

    expect(synth.getState().previewValues).toEqual({})
    expect(synth.getState().effective.oscillators[0].level).toBe(0.62)
    expect(session.getPatch().filter.resonance).toBe(0.14)
    expect(commands.historySize).toBe(0)
    synth.dispose()
  })

  it('keeps glide and velocity sensitivity on future note-ons', async () => {
    const { context, store, synth } = createHarness()
    await synth.noteOn(60, 0.5)
    const heldLevel = context.gains.at(-2)!.gain
    const heldOscillators = context.oscillators.slice(0, 10)
    heldLevel.calls.length = 0
    heldOscillators.forEach((oscillator) => {
      oscillator.frequency.calls.length = 0
    })

    store.getState().previewPatchChange('voice.velocitySensitivity', 0.9)
    store.getState().previewPatchChange('voice.glideSeconds', 0.4)
    expect(heldLevel.calls).toEqual([])
    expect(heldOscillators.every((oscillator) => oscillator.frequency.calls.length === 0)).toBe(
      true,
    )

    const gainCountBeforeNextNote = context.gains.length
    await synth.noteOn(64, 0.5)
    const nextOscillatorOneLevel = context.gains.at(-2)!.gain
    expect(context.gains.length).toBeGreaterThan(gainCountBeforeNextNote)
    expect(
      hasRamp(nextOscillatorOneLevel, 0.62 * velocityToGain(0.5, 0.9) * 0.24),
    ).toBe(true)
    expect(
      context.oscillators
        .slice(12, 22)
        .every((oscillator) =>
          oscillator.frequency.calls.some((call) => call.method === 'exponentialRamp'),
        ),
    ).toBe(true)
    synth.dispose()
  })
})

describe('envelope gesture semantics', () => {
  it('keeps attack and decay off active automation and uses committed values for the next note', async () => {
    const { context, store, synth } = createHarness()
    await synth.holdNote()
    const heldAmplitude = (context.filters[0].connections[0] as FakeGainNode).gain
    heldAmplitude.calls.length = 0

    store.getState().previewPatchChange('ampEnvelope.attackSeconds', 0.8)
    store.getState().previewPatchChange('ampEnvelope.decaySeconds', 2.2)

    expect(synth.getState().draft.ampEnvelope).toMatchObject({
      attackSeconds: 0.8,
      decaySeconds: 2.2,
    })
    expect(synth.getState().effective.ampEnvelope).toMatchObject({
      attackSeconds: 0.18,
      decaySeconds: 0.9,
    })
    expect(heldAmplitude.calls).toEqual([])

    store
      .getState()
      .applyPatchChange('ampEnvelope.attackSeconds', 0.8, 'Commit attack for the next note')
    store
      .getState()
      .applyPatchChange('ampEnvelope.decaySeconds', 2.2, 'Commit decay for the next note')
    expect(heldAmplitude.calls).toEqual([])

    context.currentTime = 4
    const gainCountBeforeNextNote = context.gains.length
    await synth.noteOn(64)
    const nextAmplitude = context.gains[gainCountBeforeNextNote].gain
    expect(hasRamp(nextAmplitude, 1, 4.8)).toBe(true)
    expect(hasRamp(nextAmplitude, 0.78, 7)).toBe(true)
    synth.dispose()
  })

  it('uses only a committed release value at a held voice subsequent note-off', async () => {
    const { context, store, synth } = createHarness()
    await synth.holdNote()
    const amplitude = (context.filters[0].connections[0] as FakeGainNode).gain
    amplitude.calls.length = 0

    store.getState().previewPatchChange('ampEnvelope.releaseSeconds', 4.1)
    expect(synth.getState().draft.ampEnvelope.releaseSeconds).toBe(4.1)
    expect(synth.getState().effective.ampEnvelope.releaseSeconds).toBe(1.4)
    expect(amplitude.calls).toEqual([])

    store
      .getState()
      .applyPatchChange('ampEnvelope.releaseSeconds', 4.1, 'Commit release before note-off')
    expect(amplitude.calls).toEqual([])

    context.currentTime = 2
    synth.noteOff(60)
    expect(hasRamp(amplitude, 0, 6.1)).toBe(true)
    synth.dispose()
  })
})
