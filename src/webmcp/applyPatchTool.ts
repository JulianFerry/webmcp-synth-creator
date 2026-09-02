import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { OPERATION_TABLE } from '../ops/schema'
import type { Change } from '../ops/types'
import { isAgentEditablePatchPath } from '../patch/paths'
import { CHANGE_JSON_SCHEMA } from './changeJsonSchema'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

const documentedApplyPatchInput = {
  reason: 'Make the held patch darker',
  changes: [{ path: 'filter.cutoffHz', value: 3200 }],
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
      code: 'INVALID_APPLY_PATCH_INPUT',
      message: firstIssue
        ? `Invalid apply_patch input at ${firstIssue.path || 'input'}: ${firstIssue.message}`
        : 'Invalid apply_patch input.',
      issues,
    },
  }
}

export function createApplyPatchTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'apply_patch',
    title: 'Apply one patch transaction',
    description: `${OPERATION_TABLE}\n\nPrefer operations over raw paths. Use a path only for a precise correction or for a parameter no operation covers. One user instruction should normally produce one call to this tool.`,
    inputSchema: {
      type: 'object',
      examples: [documentedApplyPatchInput],
      properties: {
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise musical intent for this one transaction.',
        },
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: { ...CHANGE_JSON_SCHEMA, examples: documentedApplyPatchInput.changes },
        },
      },
      required: ['reason', 'changes'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      const changes = Array.isArray(input.changes) ? input.changes : []
      if (
        changes.some(
          (change) =>
            change === null ||
            typeof change !== 'object' ||
            !isAgentEditablePatchPath((change as Record<string, unknown>).path),
        )
      ) {
        return {
          ok: false,
          error: {
            code: 'INVALID_APPLY_PATCH_INPUT',
            message:
              'Modulation routing is not agent-editable. Use the same LFO enable, shape, rate, phase, and smoothing controls exposed by the Workbench UI.',
          },
        }
      }
      try {
        const result = commandService.applyPatch(
          {
            type: 'apply_patch',
            reason: input.reason as string,
            changes: changes as Change[],
          },
          { source: 'webmcp' },
        )
        return writeToolResult(result)
      } catch (error) {
        if (error instanceof z.ZodError) return invalidInputResult(error)
        if (error instanceof CommandError) {
          return {
            ok: false,
            error: {
              code: 'PATCH_NOT_CHANGED',
              message: error.message,
            },
          }
        }
        throw error
      }
    },
  }
}
