import type { TempoSyncDivision } from '../patch/limits'
import type { EnvelopeState, PatchState } from '../patch/types'
import { mapVitalLfoRate } from './lfo'
import {
  encodeVitalDelaySeconds,
  encodeVitalEnvelopeSeconds,
  encodeVitalGlideSeconds,
  encodeVitalOscillatorLevel,
  encodeVitalReverbDecaySeconds,
  encodeVitalUnisonDetune,
} from './units'

function frequencyToMidiNote(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440)
}

function mapVitalEnvelope(prefix: 'env_1' | 'env_2', envelope: EnvelopeState) {
  return {
    [`${prefix}_attack`]: encodeVitalEnvelopeSeconds(envelope.attackSeconds, 'attack'),
    [`${prefix}_hold`]: encodeVitalEnvelopeSeconds(envelope.holdSeconds, 'hold'),
    [`${prefix}_decay`]: encodeVitalEnvelopeSeconds(envelope.decaySeconds, 'decay'),
    [`${prefix}_sustain`]: envelope.sustainLevel,
    [`${prefix}_release`]: encodeVitalEnvelopeSeconds(envelope.releaseSeconds, 'release'),
  }
}

export function mapPhaseOneVitalParameters(patch: PatchState): Record<string, number> {
  const first = patch.oscillators[0]
  const second = patch.oscillators[1]

  if (patch.filter.type !== 'lowpass') {
    throw new VitalExportError(
      `Vital 1.0.7 export supports only the logical lowpass Filter 1 model, not ${patch.filter.type}`,
    )
  }

  return {
    polyphony: patch.voice.polyphony,
    legato: Number(patch.voice.legato),
    velocity_track: patch.voice.velocitySensitivity,
    portamento_time: encodeVitalGlideSeconds(patch.voice.glideSeconds),
    osc_1_on: Number(first.enabled),
    osc_1_destination: 0,
    osc_1_level: encodeVitalOscillatorLevel(first.level),
    osc_1_wave_frame: first.wavetablePosition * 256,
    osc_1_transpose: first.transposeSemitones,
    osc_1_tune: first.fineTuneCents / 100,
    osc_1_unison_voices: first.unisonVoices,
    osc_1_unison_detune: encodeVitalUnisonDetune(first.unisonDetune),
    osc_1_stereo_spread: first.stereoSpread,
    osc_1_random_phase: first.randomPhase,
    osc_2_on: Number(second.enabled),
    osc_2_destination: 0,
    osc_2_level: encodeVitalOscillatorLevel(second.level),
    osc_2_wave_frame: second.wavetablePosition * 256,
    osc_2_transpose: second.transposeSemitones,
    osc_2_tune: second.fineTuneCents / 100,
    osc_2_unison_voices: second.unisonVoices,
    osc_2_unison_detune: encodeVitalUnisonDetune(second.unisonDetune),
    osc_2_stereo_spread: second.stereoSpread,
    osc_2_random_phase: second.randomPhase,
    ...mapVitalEnvelope('env_1', patch.ampEnvelope),
    filter_1_on: Number(patch.filter.enabled),
    filter_1_cutoff: frequencyToMidiNote(patch.filter.cutoffHz),
    filter_1_resonance: patch.filter.resonance,
    filter_2_on: 0,
  }
}

const VITAL_DELAY_TEMPO_INDEX = {
  '1/1': 6,
  '1/2': 7,
  '1/4': 8,
  '1/8': 9,
  '1/8T': 9,
  '1/16': 10,
  '1/16T': 10,
  '1/32': 11,
  '1/64': 12,
} as const satisfies Record<TempoSyncDivision, number>

export function mapStructuredVitalParameters(patch: PatchState): Record<string, number> {
  const lfoRate = mapVitalLfoRate(patch.lfo1.rate)
  const delay = patch.effects.delay
  const delayDivision = delay.division ?? '1/8'
  const delaySync = delay.mode === 'free' ? 0 : delayDivision.endsWith('T') ? 3 : 1
  const delayFrequency = encodeVitalDelaySeconds(delay.timeSeconds ?? 0.25)

  return {
    ...mapVitalEnvelope('env_2', patch.modEnvelope),
    lfo_1_sync: lfoRate.sync,
    lfo_1_sync_type: 0,
    lfo_1_tempo: lfoRate.tempo,
    lfo_1_frequency: lfoRate.frequency,
    lfo_1_phase: patch.lfo1.phase,
    lfo_1_smooth_time: patch.lfo1.smooth ? -5 : -8.5,
    delay_on: Number(delay.enabled),
    delay_dry_wet: delay.mix,
    delay_feedback: delay.feedback,
    delay_sync: delaySync,
    delay_aux_sync: delaySync,
    delay_tempo: VITAL_DELAY_TEMPO_INDEX[delayDivision],
    delay_aux_tempo: VITAL_DELAY_TEMPO_INDEX[delayDivision],
    delay_frequency: delayFrequency,
    delay_aux_frequency: delayFrequency,
    reverb_on: Number(patch.effects.reverb.enabled),
    reverb_dry_wet: patch.effects.reverb.mix,
    reverb_decay_time: encodeVitalReverbDecaySeconds(patch.effects.reverb.decaySeconds),
    reverb_size: patch.effects.reverb.size,
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
