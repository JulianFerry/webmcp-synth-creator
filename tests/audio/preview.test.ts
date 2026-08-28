import { describe, expect, it } from 'vitest'

import { createAppStore } from '../../src/app/appStore'
import { BrowserSynth } from '../../src/audio/BrowserSynth'
import {
  getAudioPreviewBehavior,
  supportsDraftPreview,
  supportsLiveAudioPreview,
} from '../../src/audio/preview'
import { CommandService } from '../../src/commands/CommandService'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionService } from '../../src/session/SessionService'

function createHarness() {
  let now = 0
  const trace = new LatencyTrace(true, () => {
    now += 1
    return now
  })
  const session = new SessionService(createDefaultPatch())
  const synth = new BrowserSynth(session, trace)
  const commands = new CommandService(session, undefined, trace)
  const store = createAppStore({ session, commands, synth })
  return { trace, session, synth, commands, store }
}

describe('ephemeral audio patch preview', () => {
  it('overlays multiple sound paths without changing canonical state, history, or traces', () => {
    const { trace, session, synth, commands, store } = createHarness()

    store.getState().previewPatchChange('oscillators.0.level', 0.21)
    store.getState().previewPatchChange('ampEnvelope.sustainLevel', 0.36)
    store.getState().previewPatchChange('filter.cutoffHz', 2_400)
    store.getState().previewPatchChange('voice.velocitySensitivity', 0.82)

    const canonical = session.getPatch()
    expect(canonical.oscillators[0].level).toBe(0.62)
    expect(canonical.ampEnvelope.sustainLevel).toBe(0.78)
    expect(canonical.filter.cutoffHz).toBe(7_200)
    expect(canonical.voice.velocitySensitivity).toBe(0.3)
    const previewed = synth.getState()
    expect(previewed.effective.oscillators[0].level).toBe(0.21)
    expect(previewed.effective.ampEnvelope.sustainLevel).toBe(0.36)
    expect(previewed.effective.filter.cutoffHz).toBe(2_400)
    expect(previewed.effective.voice.velocitySensitivity).toBe(0.82)
    expect(previewed.previewValues).toEqual({
      'oscillators.0.level': 0.21,
      'ampEnvelope.sustainLevel': 0.36,
      'filter.cutoffHz': 2_400,
      'voice.velocitySensitivity': 0.82,
    })
    expect(commands.historySize).toBe(0)
    expect(store.getState().transactionCount).toBe(0)
    expect(trace.getEvents()).toEqual([])

    for (const path of [
      'oscillators.0.level',
      'ampEnvelope.sustainLevel',
      'filter.cutoffHz',
      'voice.velocitySensitivity',
    ] as const) {
      store.getState().cancelPatchPreview(path)
    }
    const reconciled = synth.getState().effective
    expect(reconciled.oscillators[0].level).toBe(0.62)
    expect(reconciled.ampEnvelope.sustainLevel).toBe(0.78)
    expect(reconciled.filter.cutoffHz).toBe(7_200)
    expect(reconciled.voice.velocitySensitivity).toBe(0.3)
    expect(synth.getState().previewValues).toEqual({})
    synth.dispose()
  })

  it('clears previews after a failed UI commit without a committed trace or history entry', () => {
    const { trace, session, synth, commands, store } = createHarness()
    store.getState().previewPatchChange('oscillators.0.level', 0.25)
    store.getState().previewPatchChange('filter.cutoffHz', 1_600)

    const committed = store
      .getState()
      .applyPatchChange('oscillators.0.level', 2, 'Set an invalid oscillator level')

    expect(committed).toBe(false)
    expect(session.getPatch().oscillators[0].level).toBe(0.62)
    expect(synth.getState().effective.oscillators[0].level).toBe(0.62)
    expect(synth.getState().effective.filter.cutoffHz).toBe(7_200)
    expect(synth.getState().previewValues).toEqual({})
    expect(commands.historySize).toBe(0)
    expect(store.getState().transactionCount).toBe(0)
    expect(store.getState().controlResetKey).toBe(1)
    expect(trace.getEvents().map((event) => event.stage)).toEqual(['request_received'])
    synth.dispose()
  })

  it('reconciles every draft to external commits and undo while preserving one entry per command', () => {
    const { trace, session, synth, commands, store } = createHarness()
    store.getState().previewPatchChange('oscillators.0.level', 0.2)
    store.getState().previewPatchChange('filter.cutoffHz', 1_800)

    commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'External resonance update',
        changes: [{ path: 'filter.resonance', value: 0.6 }],
      },
      { source: 'webmcp' },
    )

    expect(synth.getState().previewValues).toEqual({})
    expect(synth.getState().effective.oscillators[0].level).toBe(0.62)
    expect(synth.getState().effective.filter).toMatchObject({
      cutoffHz: 7_200,
      resonance: 0.6,
    })
    expect(store.getState().transactionCount).toBe(1)
    expect(commands.historySize).toBe(1)

    store.getState().previewPatchChange('ampEnvelope.decaySeconds', 3.2)
    commands.undo({ source: 'history' })

    expect(synth.getState().previewValues).toEqual({})
    expect(synth.getState().effective.ampEnvelope.decaySeconds).toBe(0.9)
    expect(session.getPatch().filter.resonance).toBe(0.14)
    expect(store.getState().transactionCount).toBe(2)
    expect(commands.historySize).toBe(0)
    expect(trace.getEvents().map((event) => event.stage)).toEqual([
      'request_received',
      'patch_committed',
      'audio_diff_applied',
      'request_received',
      'patch_committed',
      'audio_diff_applied',
    ])
    synth.dispose()
  })

  it('documents live, next-note, draft-only, and commit-only behavior centrally', () => {
    const liveSliderPaths = [
      'oscillators.0.wavetablePosition',
      'oscillators.0.level',
      'oscillators.0.transposeSemitones',
      'oscillators.0.fineTuneCents',
      'oscillators.0.unisonVoices',
      'oscillators.0.unisonDetune',
      'oscillators.0.stereoSpread',
      'oscillators.1.wavetablePosition',
      'oscillators.1.level',
      'oscillators.1.transposeSemitones',
      'oscillators.1.fineTuneCents',
      'oscillators.1.unisonVoices',
      'oscillators.1.unisonDetune',
      'oscillators.1.stereoSpread',
      'ampEnvelope.sustainLevel',
      'filter.cutoffHz',
      'filter.resonance',
      'voice.glideSeconds',
      'voice.velocitySensitivity',
    ] as const

    expect(liveSliderPaths.every((path) => supportsLiveAudioPreview(path))).toBe(true)
    expect(getAudioPreviewBehavior('oscillators.0.unisonVoices')?.scope).toBe(
      'active-and-future-voices',
    )
    expect(getAudioPreviewBehavior('ampEnvelope.attackSeconds')?.scope).toBe('draft-only')
    expect(getAudioPreviewBehavior('ampEnvelope.decaySeconds')?.scope).toBe('draft-only')
    expect(getAudioPreviewBehavior('ampEnvelope.releaseSeconds')?.scope).toBe(
      'draft-only',
    )
    expect(supportsDraftPreview('ampEnvelope.attackSeconds')).toBe(true)
    expect(supportsLiveAudioPreview('ampEnvelope.attackSeconds')).toBe(false)
    expect(supportsLiveAudioPreview('ampEnvelope.decaySeconds')).toBe(false)
    expect(supportsLiveAudioPreview('ampEnvelope.releaseSeconds')).toBe(false)
    expect(getAudioPreviewBehavior('voice.polyphony')?.scope).toBe('commit-only')
    expect(supportsLiveAudioPreview('voice.polyphony')).toBe(false)
    expect(supportsLiveAudioPreview('voice.glideSeconds')).toBe(true)
  })

  it('drops draft and effective overlays when the audio adapter unmounts', () => {
    const { synth, store } = createHarness()
    store.getState().previewPatchChange('oscillators.0.level', 0.2)
    store.getState().previewPatchChange('ampEnvelope.attackSeconds', 1.2)

    synth.dispose()

    expect(synth.getState().previewValues).toEqual({})
    expect(synth.getState().draft.oscillators[0].level).toBe(0.62)
    expect(synth.getState().draft.ampEnvelope.attackSeconds).toBe(0.18)
    expect(synth.getState().effective.oscillators[0].level).toBe(0.62)
  })
})
