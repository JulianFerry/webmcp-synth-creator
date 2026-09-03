import { CommandService } from '../commands/CommandService'
import { SessionError, type VariantId } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

export function createSelectVariantTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'select_variant',
    title: 'Select patch variant A or B',
    description:
      'Select A or B for immediate audition, editing, undo/redo, and export. Selection does not add history.',
    inputSchema: {
      type: 'object',
      properties: {
        variant: {
          type: 'string',
          enum: ['A', 'B'],
          description: 'Variant to select.',
        },
      },
      required: ['variant'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      if (input.variant !== 'A' && input.variant !== 'B') {
        return {
          ok: false,
          error: {
            code: 'INVALID_VARIANT',
            message: 'select_variant requires variant A or B',
          },
        }
      }

      try {
        const result = commandService.selectVariant(input.variant as VariantId, {
          source: 'webmcp',
        })
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof SessionError) {
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          }
        }
        throw error
      }
    },
  }
}
