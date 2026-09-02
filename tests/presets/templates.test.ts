import { describe, expect, it } from 'vitest'

import { describePatch } from '../../src/patch/describe'
import { parsePatchState } from '../../src/patch/schemas'
import { TEMPLATE_CATEGORIES, getTemplatePatch, listTemplatePatches } from '../../src/presets/templates'

function stableBody(patch: ReturnType<typeof getTemplatePatch>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(patch).filter(([key]) => key !== 'metadata'),
  ))
}

describe('patch templates', () => {
  it('loads all fourteen categories as validated, isolated PatchState values', () => {
    expect(TEMPLATE_CATEGORIES).toHaveLength(14)
    expect(listTemplatePatches().map(({ category }) => category)).toEqual(TEMPLATE_CATEGORIES)

    for (const category of TEMPLATE_CATEGORIES) {
      const patch = parsePatchState(getTemplatePatch(category))
      expect(patch.metadata.tags).toContain(category)
      expect(patch.metadata.description).toContain(category)
    }

    const first = getTemplatePatch('pad')
    first.metadata.name = 'Caller mutation'
    expect(getTemplatePatch('pad').metadata.name).toBe('Pad Template')
  })

  it('keeps every template musically distinct beyond its metadata', () => {
    const templates = listTemplatePatches().map(({ patch }) => patch)

    expect(new Set(templates.map(stableBody))).toHaveLength(TEMPLATE_CATEGORIES.length)
    expect(new Set(templates.map((patch) => patch.oscillators[0].wavetableId)).size)
      .toBeGreaterThanOrEqual(10)
    expect(new Set(templates.map(describePatch))).toHaveLength(TEMPLATE_CATEGORIES.length)
  })

  it('uses distinct effect configurations across several templates', () => {
    const templates = listTemplatePatches().map(({ patch }) => patch)
    const effectConfigurations = new Set(templates.map((patch) => JSON.stringify(patch.effects)))
    const compressorTemplates = templates.filter((patch) => patch.effects.compressor.enabled)

    expect(effectConfigurations.size).toBeGreaterThanOrEqual(7)
    expect(compressorTemplates.length).toBeGreaterThanOrEqual(4)
    expect(new Set(compressorTemplates.map((patch) => JSON.stringify(patch.effects.compressor))).size)
      .toBeGreaterThanOrEqual(3)
  })

  it('configures LFO 1 gating for arp and percussion templates', () => {
    for (const category of ['arp', 'percussion'] as const) {
      expect(getTemplatePatch(category).lfo1).toMatchObject({
        enabled: true,
        target: 'level',
        scope: 'all',
      })
    }
  })
})
