import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

function invalidInputResult(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  const firstIssue = issues[0]
  return {
    ok: false,
    error: {
      code: 'INVALID_LFO_POINT_INPUT',
      message: firstIssue
        ? `Invalid set_lfo_point input at ${firstIssue.path || 'input'}: ${firstIssue.message}`
        : 'Invalid set_lfo_point input.',
      issues,
    },
  }
}

export function createSetLfoPointTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'set_lfo_point',
    title: 'Edit one point in the LFO shape',
    description:
      'Edit one zero-based point in LFO 1 or LFO 2 in a single transaction. The lfo argument defaults to 1. Omitted coordinates are preserved; x is clamped between neighboring points, and endpoint x positions remain pinned at 0 and 1. Power controls the curve leading from this point and cannot be set on the final point.',
    inputSchema: {
      type: 'object',
      examples: [{ reason: 'Shorten the second pulse', index: 2, x: 0.16 }],
      properties: {
        lfo: {
          type: 'integer', enum: [1, 2],
          description: 'LFO slot to edit. Defaults to 1.',
        },
        reason: {
          type: 'string', minLength: 1, maxLength: 500,
          description: 'Concise intent for this one-point LFO transaction.',
        },
        index: {
          type: 'integer', minimum: 0, maximum: 31,
          description: 'Zero-based index of the existing LFO point.',
        },
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
        power: { type: 'number', minimum: -1, maximum: 1 },
      },
      required: ['reason', 'index'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const result = commandService.setLfoPoint({
          type: 'set_lfo_point',
          reason: input.reason as string,
          ...(input.lfo === undefined ? {} : { lfo: input.lfo as 1 | 2 }),
          index: input.index as number,
          ...(input.x === undefined ? {} : { x: input.x as number }),
          ...(input.y === undefined ? {} : { y: input.y as number }),
          ...(input.power === undefined ? {} : { power: input.power as number }),
        }, { source: 'webmcp' })
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof z.ZodError) return invalidInputResult(error)
        if (error instanceof CommandError || error instanceof RangeError) {
          return { ok: false, error: { code: 'LFO_POINT_NOT_CHANGED', message: error.message } }
        }
        throw error
      }
    },
  }
}
