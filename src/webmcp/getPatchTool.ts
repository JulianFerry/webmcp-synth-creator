import { summarizePatch } from '../patch/summary'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

function roundNumbers(value: unknown): unknown {
  if (typeof value === 'number') return Number(value.toFixed(2))
  if (Array.isArray(value)) return value.map(roundNumbers)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundNumbers(item)]))
  }
  return value
}

export function createGetPatchTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'get_patch',
    title: 'Read current synth patch',
    description:
      'Read the selected editable patch before refinement. Preserve unrelated settings. For unresolved subjective, exploratory, or character-choice directions, compare A/B with create_variant; for a settled precise change, use a direct edit even when its impact is large. A/B is simultaneous judgment, while undo reverses a committed transaction.',
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
      return roundNumbers({
        ...summarizePatch(session.getPatch()),
        session: session.getSummary(),
      })
    },
  }
}
