import { summarizePatch } from '../patch/summary'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createGetSessionStateTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'get_session_state',
    title: 'Read A/B session state',
    description:
      'Read the selected variant and its undo/redo availability before changing A/B session state.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    async execute(_input, context) {
      context?.signal.throwIfAborted()
      return {
        ...session.getSummary(),
        summary: summarizePatch(session.getPatch()),
      }
    },
  }
}
