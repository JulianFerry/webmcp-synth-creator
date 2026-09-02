import type { PatchState, PatchSummary } from './types'

export function summarizePatch(patch: PatchState): PatchSummary {
  const summarizeLfo = (lfo: PatchState['lfo1']) => ({
    enabled: lfo.enabled,
    pointCount: lfo.points.length,
    points: structuredClone(lfo.points),
    rate: structuredClone(lfo.rate),
    phase: lfo.phase,
    smooth: lfo.smooth,
    smoothing: lfo.smoothing,
    target: lfo.target,
    scope: lfo.scope,
    depth: lfo.depth,
  })
  return {
    version: patch.version,
    name: patch.metadata.name,
    category: patch.metadata.category ?? null,
    description: patch.metadata.description ?? null,
    tags: [...patch.metadata.tags],
    oscillators: patch.oscillators.map((oscillator) => ({
      enabled: oscillator.enabled,
      wavetableId: oscillator.wavetableId,
      wavetablePosition: oscillator.wavetablePosition,
      level: oscillator.level,
      transposeSemitones: oscillator.transposeSemitones,
      fineTuneCents: oscillator.fineTuneCents,
      unisonVoices: oscillator.unisonVoices,
      unisonDetune: oscillator.unisonDetune,
      stereoSpread: oscillator.stereoSpread,
      randomPhase: oscillator.randomPhase,
      pan: oscillator.pan,
    })),
    ampEnvelope: structuredClone(patch.ampEnvelope),
    modEnvelope: structuredClone(patch.modEnvelope),
    filter: structuredClone(patch.filter),
    lfo1: summarizeLfo(patch.lfo1),
    lfo2: summarizeLfo(patch.lfo2),
    voice: structuredClone(patch.voice),
    effects: structuredClone(patch.effects),
    wavetables: Object.values(patch.wavetableData).map((wavetable) => ({
      id: wavetable.id,
      name: wavetable.name,
      frameCount: wavetable.frames.length,
    })),
  }
}
