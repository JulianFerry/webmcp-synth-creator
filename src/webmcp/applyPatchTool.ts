import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { SUPPORTED_PATCH_PATHS } from '../patch/paths'
import type { WebMcpToolDefinition } from './ModelContextGateway'

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
    description:
      'Apply one coherent sound-design change. Include coordinated edits in one call and preserve unrelated settings.',
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
          items: {
            type: 'object',
            examples: documentedApplyPatchInput.changes,
            properties: {
              path: { type: 'string', enum: [...SUPPORTED_PATCH_PATHS] },
              value: {
                description:
                  'JSON value for the selected path. The path-specific type and bounds are validated before commit.',
                oneOf: [
                  { type: 'string' },
                  { type: 'number' },
                  { type: 'boolean' },
                  { type: 'array' },
                  { type: 'object' },
                ],
              },
            },
            required: ['path', 'value'],
            additionalProperties: false,
          },
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
      try {
        const result = commandService.applyPatch(
          {
            type: 'apply_patch',
            reason: input.reason as string,
            changes: input.changes as Array<{ path: never; value: unknown }>,
          },
          { source: 'webmcp' },
        )
        return {
          changed: result.changed,
          summary: result.summary,
          canUndo: result.canUndo,
          canRedo: result.canRedo,
          session: result.session,
          correlationId: result.correlationId,
        }
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
