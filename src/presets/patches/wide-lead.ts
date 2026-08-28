import fixture from '../../../fixtures/patches/wide-lead.patch.json' with { type: 'json' }
import { createCuratedPatch } from './shared'

export const WIDE_LEAD_PATCH = createCuratedPatch(fixture)
