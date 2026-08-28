import { parsePatchState } from '../patch/schemas'
import type { PatchCategory, PatchState } from '../patch/types'
import { ETHEREAL_GATE_PATCH } from './patches/ethereal-gate'
import { GLASS_PLUCK_PATCH } from './patches/glass-pluck'
import { MIDNIGHT_PAD_PATCH } from './patches/midnight-pad'
import { RHYTHMIC_PULSE_PATCH } from './patches/rhythmic-pulse'
import { WARM_MONO_BASS_PATCH } from './patches/warm-mono-bass'
import { WIDE_LEAD_PATCH } from './patches/wide-lead'

export interface CuratedPresetSummary {
  id: string
  name: string
  category: PatchCategory
  description: string
  tags: string[]
}

interface CuratedPresetEntry {
  id: string
  patch: PatchState
}

const entries: CuratedPresetEntry[] = [
  { id: 'ethereal-gate', patch: ETHEREAL_GATE_PATCH },
  { id: 'midnight-pad', patch: MIDNIGHT_PAD_PATCH },
  { id: 'warm-mono-bass', patch: WARM_MONO_BASS_PATCH },
  { id: 'glass-pluck', patch: GLASS_PLUCK_PATCH },
  { id: 'wide-lead', patch: WIDE_LEAD_PATCH },
  { id: 'rhythmic-pulse', patch: RHYTHMIC_PULSE_PATCH },
]

const ids = entries.map(({ id }) => id)
if (new Set(ids).size !== ids.length) throw new Error('Curated preset ids must be unique')

const presetRegistry = new Map(
  entries.map(({ id, patch }) => [id, parsePatchState(structuredClone(patch))]),
)

export class PresetRegistryError extends Error {}

function summarizePreset(id: string, patch: PatchState): CuratedPresetSummary {
  const category = patch.metadata.category
  const description = patch.metadata.description
  if (!category || !description) {
    throw new PresetRegistryError(`Curated preset ${id} requires category and description metadata`)
  }
  return {
    id,
    name: patch.metadata.name,
    category,
    description,
    tags: [...patch.metadata.tags],
  }
}

export function listPresets(category?: PatchCategory): CuratedPresetSummary[] {
  return [...presetRegistry.entries()]
    .map(([id, patch]) => summarizePreset(id, patch))
    .filter((preset) => category === undefined || preset.category === category)
}

export function getPresetPatch(presetId: string): PatchState {
  const patch = presetRegistry.get(presetId)
  if (!patch) throw new PresetRegistryError(`Unknown curated preset: ${presetId}`)
  return structuredClone(patch)
}

export function findMatchingPresetId(patch: PatchState): string | null {
  const serialized = JSON.stringify(patch)
  for (const [id, preset] of presetRegistry) {
    if (JSON.stringify(preset) === serialized) return id
  }
  return null
}
