import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import type { LfoPoint } from '../patch/types'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

const documentedSetLfoShapeInput = {
  reason: 'Shorten the second pulse while preserving the current rate',
  lfo: 1,
  points: [
    { x: 0, y: 0 },
    { x: 0.02, y: 1 },
    { x: 0.2, y: 0 },
    { x: 0.27, y: 0.9 },
    { x: 0.36, y: 0 },
    { x: 0.52, y: 1 },
    { x: 0.7, y: 0 },
    { x: 1, y: 0 },
  ],
}

function invalidInputResult(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  const firstIssue = issues[0]
  return {
    ok: false,
    error: {
      code: 'INVALID_LFO_SHAPE_INPUT',
      message: firstIssue
        ? `Invalid set_lfo_shape input at ${firstIssue.path || 'input'}: ${firstIssue.message}`
        : 'Invalid set_lfo_shape input.',
      issues,
    },
  }
}

export function createSetLfoShapeTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'set_lfo_shape',
    title: 'Edit the point-based LFO shape',
    description:
      'Edit LFO 1 or LFO 2 points for a focused shape change. The lfo argument defaults to 1. Preserve enabled state, rate, target, scope, and depth. The optional boolean smooth setting controls interpolation between shape points; output slew is the separate lfoN.smoothing path edited by gate, movement, or apply_patch.',
    inputSchema: {
      type: 'object',
      examples: [documentedSetLfoShapeInput],
      properties: {
        lfo: {
          type: 'integer', enum: [1, 2],
          description: 'LFO slot to edit. Defaults to 1.',
        },
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise structural intent for this one LFO transaction.',
        },
        points: {
          type: 'array',
          minItems: 2,
          maxItems: 32,
          description: 'Normalized LFO points sorted by x, with the first pinned at x=0 and the last pinned at x=1.',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
              power: { type: 'number', minimum: -1, maximum: 1 },
            },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        smooth: {
          type: 'boolean',
          description: 'Optional boolean shape interpolation change, not continuous output slew. Omit to preserve it.',
        },
      },
      required: ['reason', 'points'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const result = commandService.setLfoShape(
          {
            type: 'set_lfo_shape',
            reason: input.reason as string,
            ...(input.lfo === undefined ? {} : { lfo: input.lfo as 1 | 2 }),
            points: input.points as LfoPoint[],
            ...(input.smooth === undefined ? {} : { smooth: input.smooth as boolean }),
          },
          { source: 'webmcp' },
        )
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof z.ZodError) return invalidInputResult(error)
        if (error instanceof CommandError) {
          return {
            ok: false,
            error: { code: 'LFO_NOT_CHANGED', message: error.message },
          }
        }
        throw error
      }
    },
  }
}
