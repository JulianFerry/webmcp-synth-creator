import { describe, expect, it } from 'vitest'

import { describePatch } from '../../src/patch/describe'
import { ARTICULATION_PRESETS } from '../../src/ops/articulationAndLayer'
import { getPresetPatch } from '../../src/presets/registry'
import { getTemplatePatch, listTemplatePatches } from '../../src/presets/templates'

const curatedIds = [
  'ethereal-gate', 'midnight-pad', 'warm-mono-bass', 'glass-pluck', 'wide-lead',
  'rhythmic-pulse',
]

describe('describePatch', () => {
  it('deterministically describes all curated presets and templates', () => {
    const patches = [
      ...curatedIds.map((id) => [id, getPresetPatch(id)] as const),
      ...listTemplatePatches().map(({ category, patch }) => [`template:${category}`, patch] as const),
    ]
    const descriptions = Object.fromEntries(patches.map(([id, patch]) => [id, describePatch(patch)]))

    expect(descriptions).toMatchSnapshot()
    for (const [id, patch] of patches) {
      expect(describePatch(patch), id).toBe(descriptions[id])
      expect(descriptions[id].split('.').length, id).toBeGreaterThan(2)
    }
  })

  it.each(Object.entries(ARTICULATION_PRESETS))('reverse-maps the full %s envelope', (kind, envelope) => {
    const patch = getTemplatePatch('keys')
    patch.ampEnvelope = structuredClone(envelope)
    expect(describePatch(patch)).toContain(`${kind} envelope`)
  })

  it('does not describe unison when multiple voices have no detune', () => {
    const patch = getTemplatePatch('pad')
    patch.oscillators[0].unisonVoices = 7
    patch.oscillators[0].unisonDetune = 0
    expect(describePatch(patch)).not.toContain('unison')
  })
})
