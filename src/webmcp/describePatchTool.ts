import { describePatch } from '../patch/describe'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createDescribePatchTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'describe_patch',
    title: 'Describe the current patch',
    description: 'Return deterministic musical prose derived only from the current PatchState.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(_input, context) {
      context?.signal.throwIfAborted()
      return { description: describePatch(session.getPatch()) }
    },
  }
}
