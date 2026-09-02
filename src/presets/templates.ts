import ambient from '../../fixtures/templates/ambient.patch.json' with { type: 'json' }
import arp from '../../fixtures/templates/arp.patch.json' with { type: 'json' }
import bass from '../../fixtures/templates/bass.patch.json' with { type: 'json' }
import bell from '../../fixtures/templates/bell.patch.json' with { type: 'json' }
import brass from '../../fixtures/templates/brass.patch.json' with { type: 'json' }
import cinematic from '../../fixtures/templates/cinematic.patch.json' with { type: 'json' }
import fx from '../../fixtures/templates/fx.patch.json' with { type: 'json' }
import keys from '../../fixtures/templates/keys.patch.json' with { type: 'json' }
import lead from '../../fixtures/templates/lead.patch.json' with { type: 'json' }
import pad from '../../fixtures/templates/pad.patch.json' with { type: 'json' }
import percussion from '../../fixtures/templates/percussion.patch.json' with { type: 'json' }
import pluck from '../../fixtures/templates/pluck.patch.json' with { type: 'json' }
import strings from '../../fixtures/templates/strings.patch.json' with { type: 'json' }
import vocal from '../../fixtures/templates/vocal.patch.json' with { type: 'json' }

import { parsePatchState } from '../patch/schemas'
import type { PatchState } from '../patch/types'

export const TEMPLATE_CATEGORIES = [
  'bass', 'pad', 'pluck', 'lead', 'keys', 'strings', 'brass', 'vocal', 'bell', 'arp',
  'ambient', 'cinematic', 'fx', 'percussion',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

const fixtures = {
  bass, pad, pluck, lead, keys, strings, brass, vocal, bell, arp, ambient, cinematic, fx,
  percussion,
} as unknown as Record<TemplateCategory, unknown>

const templates = new Map(TEMPLATE_CATEGORIES.map((category) => {
  return [category, parsePatchState(fixtures[category])] as const
}))

export function getTemplatePatch(category: TemplateCategory): PatchState {
  const template = templates.get(category)
  if (!template) throw new TypeError(`Unknown template category: ${category}`)
  return structuredClone(template)
}

export function listTemplatePatches(): Array<{ category: TemplateCategory; patch: PatchState }> {
  return TEMPLATE_CATEGORIES.map((category) => ({ category, patch: getTemplatePatch(category) }))
}
