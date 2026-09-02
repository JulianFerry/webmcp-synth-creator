import { describe, expect, it } from 'vitest'

import { parsePatchState } from '../../src/patch/schemas'
import { TEMPLATE_CATEGORIES, getTemplatePatch, listTemplatePatches } from '../../src/presets/templates'

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
})
