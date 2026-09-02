import { CommandError, CommandService } from '../commands/CommandService'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

export function createRedoTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'redo',
    title: 'Redo the selected variant',
    description: 'Redo one undone transaction on the selected variant without changing the other variant.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    async execute(_input, context) {
      context?.signal.throwIfAborted()
      try {
        const result = commandService.redo({ source: 'webmcp' })
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof CommandError) {
          return {
            ok: false,
            error: { code: 'NOTHING_TO_REDO', message: error.message },
          }
        }
        throw error
      }
    },
  }
}
