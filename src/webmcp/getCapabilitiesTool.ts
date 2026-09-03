import { ARTICULATION_PRESETS } from '../ops/articulationAndLayer'
import { GATE_PATTERNS } from '../ops/patterns'
import { MOVEMENT_SHAPES } from '../ops/shapes'
import { TEMPO_SYNC_DIVISIONS } from '../patch/limits'
import { DISTORTION_TYPES, FILTER_SLOPES, FILTER_TYPES, LFO_SCOPES, LFO_TARGETS, PATCH_PATH_REGISTRY } from '../patch/paths'
import { TEMPLATE_CATEGORIES } from '../presets/templates'
import { WAVETABLE_CAPABILITIES } from '../wavetables/registry'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createGetCapabilitiesTool(): WebMcpToolDefinition {
  return {
    name: 'get_capabilities',
    title: 'Read synth capabilities',
    description: 'Read valid values and units before choosing operations or raw paths. voice.mode is derived; write voice.polyphony instead.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(_input, context) {
      context?.signal.throwIfAborted()
      return {
        wavetables: WAVETABLE_CAPABILITIES.map((wavetable) => ({ ...wavetable })),
        lfoTargets: [...LFO_TARGETS],
        lfoScopes: [...LFO_SCOPES],
        lfoOperationSlots: { gate: 1, movement: 2 },
        filterTypes: [...FILTER_TYPES],
        filterSlopesDbPerOctave: [...FILTER_SLOPES],
        distortionTypes: [...DISTORTION_TYPES],
        gatePatterns: Object.keys(GATE_PATTERNS),
        movementShapes: Object.keys(MOVEMENT_SHAPES),
        articulationKinds: Object.keys(ARTICULATION_PRESETS),
        tempoDivisions: [...TEMPO_SYNC_DIVISIONS],
        templateCategories: [...TEMPLATE_CATEGORIES],
        rawPaths: Object.entries(PATCH_PATH_REGISTRY).map(([path, { unit }]) => ({ path, unit })),
        derived: { 'voice.mode': 'mono when voice.polyphony is 1, otherwise poly; read-only' },
      }
    },
  }
}
