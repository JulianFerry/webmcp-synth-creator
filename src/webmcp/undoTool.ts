import { CommandError, CommandService } from '../commands/CommandService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createUndoTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'undo',
    title: 'Undo the selected variant',
    description: 'Undo one complete transaction on the selected variant without changing the other variant.',
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
        const result = commandService.undo({ source: 'webmcp' })
        return {
          changed: result.changed,
          summary: result.summary,
          canUndo: result.canUndo,
          canRedo: result.canRedo,
          session: result.session,
          correlationId: result.correlationId,
        }
      } catch (error) {
        if (error instanceof CommandError) {
          return {
            ok: false,
            error: { code: 'NOTHING_TO_UNDO', message: error.message },
          }
        }
        throw error
      }
    },
  }
}
