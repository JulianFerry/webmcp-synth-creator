import type { PatchState } from '../patch/types'

function frequencyToMidiNote(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440)
}

export function mapPhaseOneVitalParameters(patch: PatchState): Record<string, number> {
  const first = patch.oscillators[0]
  const second = patch.oscillators[1]

  return {
    polyphony: patch.voice.polyphony,
    legato: Number(patch.voice.legato),
    velocity_track: patch.voice.velocitySensitivity,
    osc_1_on: Number(first.enabled),
    osc_1_level: first.level,
    osc_1_wave_frame: first.wavetablePosition * 256,
    osc_1_transpose: first.transposeSemitones,
    osc_1_tune: first.fineTuneCents / 100,
    osc_1_unison_voices: first.unisonVoices,
    osc_1_unison_detune: first.unisonDetune * 12,
    osc_1_stereo_spread: first.stereoSpread,
    osc_1_random_phase: first.randomPhase,
    osc_2_on: Number(second.enabled),
    osc_2_level: second.level,
    osc_2_wave_frame: second.wavetablePosition * 256,
    osc_2_transpose: second.transposeSemitones,
    osc_2_tune: second.fineTuneCents / 100,
    osc_2_unison_voices: second.unisonVoices,
    osc_2_unison_detune: second.unisonDetune * 12,
    osc_2_stereo_spread: second.stereoSpread,
    osc_2_random_phase: second.randomPhase,
    env_1_attack: patch.ampEnvelope.attackSeconds,
    env_1_hold: patch.ampEnvelope.holdSeconds,
    env_1_decay: patch.ampEnvelope.decaySeconds,
    env_1_sustain: patch.ampEnvelope.sustainLevel,
    env_1_release: patch.ampEnvelope.releaseSeconds,
    filter_1_on: Number(patch.filter.enabled),
    filter_1_cutoff: frequencyToMidiNote(patch.filter.cutoffHz),
    filter_1_resonance: patch.filter.resonance,
  }
}

export function setVitalValues(
  settings: Record<string, unknown>,
  values: Record<string, number>,
): void {
  const unknown = Object.keys(values).filter((key) => !(key in settings))
  if (unknown.length > 0) {
    throw new VitalExportError(`Unknown Vital settings: ${unknown.sort().join(', ')}`)
  }
  Object.assign(settings, values)
}

export class VitalExportError extends Error {}
