import type { PatchState } from './types'
import { matchArticulation } from '../ops/articulationSelection'

const WAVETABLE_CHARACTER: Record<string, string> = {
  sine: 'pure sine', triangle: 'soft triangle', saw: 'saw', 'warm-saw': 'warm saw',
  'soft-square': 'hollow square', hollow: 'hollow', harsh: 'harsh', airy: 'airy saw',
  glass: 'glassy', metallic: 'metallic', digital: 'digital', vocal: 'vocal',
}

function envelopeSentence(patch: PatchState): string {
  const { attackSeconds: attack, releaseSeconds: release, sustainLevel: sustain } = patch.ampEnvelope
  const attackLabel = attack >= 0.65 ? 'Slow attack' : attack >= 0.18 ? 'Soft attack' : 'Fast attack'
  const releaseLabel = release >= 0.55 ? 'long release' : release >= 0.18 ? 'medium release' : 'short release'
  const shape = sustain < 0.15 ? 'decaying' : sustain > 0.8 ? 'sustained' : 'shaped'
  return `${attackLabel}, ${releaseLabel}; ${shape} ${matchArticulation(patch.ampEnvelope)} envelope.`
}

function lfoSentence(patch: PatchState): string | null {
  if (!patch.lfo1.enabled) return null
  const route = patch.modulations.find(({ source }) => source === 'lfo1')
  if (!route) return null
  const rate = patch.lfo1.rate.mode === 'sync' ? patch.lfo1.rate.division : `${patch.lfo1.rate.hz} Hz`
  const xs = patch.lfo1.points.map(({ x }) => x)
  const gaps = xs.slice(1).map((x, index) => x - xs[index])
  const regular = gaps.length < 2 || Math.max(...gaps) - Math.min(...gaps) < 0.03
  const action = route.destination === 'volume' || route.destination.endsWith('.level')
    ? 'Gated'
    : 'Modulated'
  return `${action} at ${rate}${regular ? '' : ' with an uneven pulse'} for ${route.destination}.`
}

function widthAndEffectsSentence(patch: PatchState): string | null {
  const parts: string[] = []
  const osc = patch.oscillators[0]
  if (osc.unisonVoices > 1 && osc.unisonDetune > 0) {
    const detune = osc.unisonDetune >= 0.45 ? 'heavily detuned' :
      osc.unisonDetune >= 0.15 ? 'detuned' : 'tightly tuned'
    parts.push(`${osc.stereoSpread >= 0.7 ? 'Wide' : 'Narrow'} ${detune} unison`)
  }
  if (patch.effects.reverb.enabled) {
    parts.push(`${patch.effects.reverb.mix >= 0.45 ? 'heavy' : 'light'} reverb`)
  }
  if (patch.effects.delay.enabled) {
    parts.push(`${patch.effects.delay.mix >= 0.35 ? 'strong' : 'light'} delay`)
  }
  if (patch.effects.distortion.enabled) {
    parts.push(`${patch.effects.distortion.mix >= 0.6 ? 'strong' : 'light'} distortion`)
  }
  return parts.length > 0 ? `${parts.join(', ')}.` : null
}

function layerSentence(patch: PatchState): string | null {
  const [primary, layer] = patch.oscillators
  if (!layer.enabled || layer.level <= 0) return null
  const interval = layer.transposeSemitones - primary.transposeSemitones
  const role = interval === -12 ? 'Sub layer an octave down' : interval === 12
    ? 'Second layer an octave up'
    : interval === 7 ? 'Second layer a fifth up' : 'Second oscillator layer'
  const level = layer.level < primary.level * 0.55 ? 'low level' : 'supporting level'
  return `${role} at ${level}.`
}

export function describePatch(patch: PatchState): string {
  const osc = patch.oscillators.find(({ enabled, level }) => enabled && level > 0) ?? patch.oscillators[0]
  const character = WAVETABLE_CHARACTER[osc.wavetableId] ?? osc.wavetableId.replaceAll('-', ' ')
  const brightness = patch.filter.enabled
    ? patch.filter.cutoffHz >= 7000 ? 'Bright' : patch.filter.cutoffHz <= 1500 ? 'Dark' : 'Warm'
    : 'Open'
  const position = osc.wavetablePosition >= 0.65 ? ' forward-positioned' : ''
  const sentences = [
    `${brightness}${position} ${character} ${patch.metadata.category ?? 'patch'}.`,
    envelopeSentence(patch),
    lfoSentence(patch),
    widthAndEffectsSentence(patch),
    layerSentence(patch),
  ]
  return sentences.filter((sentence): sentence is string => sentence !== null).join(' ')
}
