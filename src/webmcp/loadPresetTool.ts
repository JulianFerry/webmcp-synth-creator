import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { listPresets, PresetRegistryError } from '../presets/registry'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

const presetIds = listPresets().map(({ id }) => id)

export function createLoadPresetTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'load_preset',
    title: 'Load a curated patch start',
    description:
      'Load one generated curated patch into the selected variant as one undoable transaction. Read it with get_patch before applying a focused refinement.',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          enum: presetIds,
          description: 'Curated preset id from list_presets.',
        },
      },
      required: ['presetId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const result = commandService.loadPreset(
          { type: 'load_preset', presetId: input.presetId as string },
          { source: 'webmcp' },
        )
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof PresetRegistryError) {
          return {
            ok: false,
            error: { code: 'INVALID_PRESET_ID', message: error.message },
          }
        }
        if (error instanceof CommandError) {
          return {
            ok: false,
            error: { code: 'PATCH_NOT_CHANGED', message: error.message },
          }
        }
        throw error
      }
    },
  }
}
