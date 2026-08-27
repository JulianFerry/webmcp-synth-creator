import { summarizePatch } from '../patch/summary'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createGetPatchTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'get_patch',
    title: 'Read current synth patch',
    description:
      'Read the authoritative logical synth patch before editing. Returns supported state in musical units.',
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
      return summarizePatch(session.getPatch())
    },
  }
}
