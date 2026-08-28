import type { PatchState, PatchSummary } from './types'

export function summarizePatch(patch: PatchState): PatchSummary {
  return {
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
      stereoSpread: oscillator.stereoSpread,
    })),
    ampEnvelope: structuredClone(patch.ampEnvelope),
    modEnvelope: structuredClone(patch.modEnvelope),
    filter: structuredClone(patch.filter),
    lfo1: {
      enabled: patch.lfo1.enabled,
      pointCount: patch.lfo1.points.length,
      points: structuredClone(patch.lfo1.points),
      rate: structuredClone(patch.lfo1.rate),
      phase: patch.lfo1.phase,
      smooth: patch.lfo1.smooth,
    },
    modulations: structuredClone(patch.modulations),
    voice: structuredClone(patch.voice),
    effects: structuredClone(patch.effects),
    wavetables: Object.values(patch.wavetableData).map((wavetable) => ({
      id: wavetable.id,
      name: wavetable.name,
      frameCount: wavetable.frames.length,
    })),
  }
}
