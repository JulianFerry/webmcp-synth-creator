import type { PatchState } from './types'

export type PatchSection =
  | 'metadata'
  | 'osc1'
  | 'osc2'
  | 'osc3'
  | 'amp_env'
  | 'mod_env'
  | 'lfo1'
  | 'lfo2'
  | 'filter'
  | 'effects'
  | 'voice'
  | 'wavetables'

export function pathToSection(path: string): PatchSection {
  if (path === 'wavetableData') return 'wavetables'
  if (path.startsWith('oscillators.0.')) return 'osc1'
  if (path.startsWith('oscillators.1.')) return 'osc2'
  if (path.startsWith('oscillators.2.')) return 'osc3'
  if (path.startsWith('ampEnvelope.')) return 'amp_env'
  if (path.startsWith('modEnvelope.')) return 'mod_env'
  if (path.startsWith('lfo1.')) return 'lfo1'
  if (path.startsWith('lfo2.')) return 'lfo2'
  if (path.startsWith('effects.')) return 'effects'
  if (path.startsWith('metadata.')) return 'metadata'
  if (path.startsWith('filter.')) return 'filter'
  if (path.startsWith('voice.')) return 'voice'
  throw new TypeError(`Patch path has no section: ${path}`)
}

export function sectionValue(patch: PatchState, section: PatchSection): unknown {
  switch (section) {
    case 'metadata': return structuredClone(patch.metadata)
    case 'osc1': return structuredClone(patch.oscillators[0])
    case 'osc2': return structuredClone(patch.oscillators[1])
    case 'osc3': return structuredClone(patch.oscillators[2])
    case 'amp_env': return structuredClone(patch.ampEnvelope)
    case 'mod_env': return structuredClone(patch.modEnvelope)
    case 'lfo1': return structuredClone(patch.lfo1)
    case 'lfo2': return structuredClone(patch.lfo2)
    case 'filter': return structuredClone(patch.filter)
    case 'effects': return structuredClone(patch.effects)
    case 'voice': return { ...structuredClone(patch.voice), mode: patch.voice.polyphony === 1 ? 'mono' : 'poly' }
    case 'wavetables': return Object.values(patch.wavetableData).map(({ id, name, frames }) => ({ id, name, frameCount: frames.length }))
  }
}

export function affectedSections(patch: PatchState, paths: readonly string[]): Record<string, unknown> {
  const sections = new Set(paths.map(pathToSection))
  return Object.fromEntries([...sections].map((section) => [section, sectionValue(patch, section)]))
}
