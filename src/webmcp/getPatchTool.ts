import { summarizePatch } from '../patch/summary'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export function createGetPatchTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'get_patch',
    title: 'Read current synth patch',
    description:
      'Read the selected editable patch before refinement. Preserve unrelated settings and prefer one apply_patch call per perceptual request. LFO 1 globally gates every enabled oscillator with fixed routing.',
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
