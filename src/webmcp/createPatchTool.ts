import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import type { PatchState } from '../patch/types'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { AGENT_PATCH_STATE_INPUT_SCHEMA } from './patchJsonSchema'

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

export function createCreatePatchTool(
  commandService: CommandService,
  session: SessionService,
): WebMcpToolDefinition {
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
          ...AGENT_PATCH_STATE_INPUT_SCHEMA,
          description:
            'Complete editable PatchState v2 projection, including referenced wavetable data. LFO 1 always uses the fixed global Workbench amplitude routing shown by the UI.',
        },
      },
      required: ['reason', 'patch'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const inputPatch = input.patch as Omit<PatchState, 'modulations'> & {
          modulations?: unknown
        }
        const editablePatch = { ...inputPatch }
        delete editablePatch.modulations
        const result = commandService.createPatch(
          {
            type: 'create_patch',
            reason: input.reason as string,
            patch: {
              ...editablePatch,
              modulations: session.getPatch().modulations,
            } as PatchState,
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
