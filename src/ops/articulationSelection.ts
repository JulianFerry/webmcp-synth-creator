import type { EnvelopeState } from '../patch/types'
import { ARTICULATION_PRESETS, type ArticulationPreset } from './articulationAndLayer'
import type { ArticulationKind } from './types'

const ARTICULATION_KINDS = Object.keys(ARTICULATION_PRESETS) as ArticulationKind[]
const MATCH_FIELDS = Object.keys(ARTICULATION_PRESETS.pluck) as (keyof ArticulationPreset)[]

function distance(envelope: EnvelopeState, preset: ArticulationPreset): number {
  return MATCH_FIELDS.reduce((sum, field) => {
    const delta = envelope[field] - preset[field]
    return sum + delta * delta
  }, 0)
}

export function matchArticulation(envelope: EnvelopeState): ArticulationKind {
  return ARTICULATION_KINDS.reduce((best, candidate) =>
    distance(envelope, ARTICULATION_PRESETS[candidate]) <
      distance(envelope, ARTICULATION_PRESETS[best]) ? candidate : best)
}

export function selectArticulation(attributes: {
  attack?: number
  release?: number
}): ArticulationKind {
  const dimensions = [
    attributes.attack === undefined ? null : ['attackSeconds', attributes.attack * 0.85],
    attributes.release === undefined ? null : ['releaseSeconds', attributes.release * 0.7],
  ].filter((entry): entry is [keyof ArticulationPreset, number] => entry !== null)

  if (dimensions.length === 0) return 'sustain'
  return ARTICULATION_KINDS.reduce((best, candidate) => {
    const score = (kind: ArticulationKind) => dimensions.reduce((sum, [field, target]) => {
      const delta = ARTICULATION_PRESETS[kind][field] - target
      return sum + delta * delta
    }, 0)
    return score(candidate) < score(best) ? candidate : best
  })
}
