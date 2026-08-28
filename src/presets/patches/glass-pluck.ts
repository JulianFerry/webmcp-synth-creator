import fixture from '../../../fixtures/patches/glass-pluck.patch.json' with { type: 'json' }
import { createCuratedPatch } from './shared'

export const GLASS_PLUCK_PATCH = createCuratedPatch(fixture)
