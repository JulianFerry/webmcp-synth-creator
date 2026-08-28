import fixture from '../../../fixtures/patches/midnight-pad.patch.json' with { type: 'json' }
import { createCuratedPatch } from './shared'

export const MIDNIGHT_PAD_PATCH = createCuratedPatch(fixture)
