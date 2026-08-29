import { z } from 'zod'

import type { PatchCategory } from '../patch/types'
import { listPresets } from '../presets/registry'
import type { WebMcpToolDefinition } from './ModelContextGateway'

const presetCategorySchema = z
  .enum(['pad', 'bass', 'lead', 'pluck', 'keys', 'atmosphere', 'rhythmic', 'other'])
  .optional()

export function createListPresetsTool(): WebMcpToolDefinition {
  return {
    name: 'list_presets',
    title: 'List patch starts',
    description:
      'List validated musical starts and the A–H browser/Vital calibration ladder. Optionally filter by category, then use load_preset before conservative refinement.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['pad', 'bass', 'lead', 'pluck', 'keys', 'atmosphere', 'rhythmic', 'other'],
          description: 'Optional patch category.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      const category = presetCategorySchema.parse(input.category) as PatchCategory | undefined
      return listPresets(category)
    },
  }
}
