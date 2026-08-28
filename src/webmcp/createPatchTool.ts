import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import type { PatchState } from '../patch/types'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { PATCH_STATE_INPUT_SCHEMA } from './patchJsonSchema'

function createPatchError(error: z.ZodError | CommandError) {
  if (error instanceof z.ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    return {
      ok: false,
      error: {
        code: 'INVALID_CREATE_PATCH_INPUT',
        message: issues[0]
          ? `Invalid create_patch input at ${issues[0].path || 'input'}: ${issues[0].message}`
          : 'Invalid create_patch input.',
        issues,
      },
    }
  }
  return { ok: false, error: { code: 'PATCH_NOT_CHANGED', message: error.message } }
}

export function createCreatePatchTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'create_patch',
    title: 'Create a complete synth patch',
    description:
      'Replace the selected variant with one complete validated PatchState in musical units. Use get_patch before later refinements and never send raw Vital fields.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise intent for creating this patch.',
        },
        patch: {
          ...PATCH_STATE_INPUT_SCHEMA,
          description: 'Complete PatchState v1, including referenced wavetable data.',
        },
      },
      required: ['reason', 'patch'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const result = commandService.createPatch(
          {
            type: 'create_patch',
            reason: input.reason as string,
            patch: input.patch as PatchState,
          },
          { source: 'webmcp' },
        )
        return {
          changed: result.changed,
          summary: result.summary,
          session: result.session,
          canUndo: result.canUndo,
          canRedo: result.canRedo,
          correlationId: result.correlationId,
        }
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof CommandError) {
          return createPatchError(error)
        }
        throw error
      }
    },
  }
}
