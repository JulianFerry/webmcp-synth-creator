import fixture from '../../../fixtures/patches/ethereal-gate.patch.json' with { type: 'json' }
import { createCuratedPatch } from './shared'

export const ETHEREAL_GATE_PATCH = createCuratedPatch(fixture)
