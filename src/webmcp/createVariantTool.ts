import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { AGENT_EDITABLE_PATCH_PATHS, isAgentEditablePatchPath } from '../patch/paths'
import { SessionError } from '../session/SessionService'
import type { CreateVariantCommand } from '../session/variantCommands'
import type { WebMcpToolDefinition } from './ModelContextGateway'

const documentedCreateVariantInput = {
  reason: 'Create a wider B alternative while preserving the tone',
  changes: [
    { path: 'metadata.name', value: 'Ethereal Gate Wide B' },
    { path: 'oscillators.0.stereoSpread', value: 1 },
    { path: 'oscillators.0.unisonVoices', value: 7 },
  ],
}

function createVariantError(error: z.ZodError | CommandError | SessionError) {
  if (error instanceof z.ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    return {
      ok: false,
      error: {
        code: 'INVALID_CREATE_VARIANT_INPUT',
        message: issues[0]
          ? `Invalid create_variant input at ${issues[0].path || 'input'}: ${issues[0].message}`
          : 'Invalid create_variant input.',
        issues,
      },
    }
  }

  return {
    ok: false,
    error: {
      code:
        error instanceof SessionError && error.code === 'VARIANT_B_EXISTS'
          ? 'VARIANT_B_ALREADY_EXISTS'
          : 'VARIANT_NOT_CHANGED',
      message: error.message,
    },
  }
}

export function createCreateVariantTool(commandService: CommandService): WebMcpToolDefinition {
  return {
    name: 'create_variant',
    title: 'Create one B alternative',
    description:
      'Clone the selected patch to B and apply one coherent alternative atomically. Variant A remains unchanged.',
    inputSchema: {
      type: 'object',
      examples: [documentedCreateVariantInput],
      properties: {
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise intent for the alternative.',
        },
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', enum: [...AGENT_EDITABLE_PATCH_PATHS] },
              value: {
                description: 'Validated JSON value for the selected logical patch path.',
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
        replaceExisting: {
          type: 'boolean',
          description: 'Set true only when explicitly replacing an existing B alternative.',
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
            code: 'INVALID_CREATE_VARIANT_INPUT',
            message:
              'Modulation routing is not agent-editable. Variants retain the selected patch’s existing routes.',
          },
        }
      }
      try {
        const result = commandService.createVariant(
          {
            type: 'create_variant',
            reason: input.reason as string,
            changes: changes as CreateVariantCommand['changes'],
            ...(input.replaceExisting === undefined
              ? {}
              : { replaceExisting: input.replaceExisting as boolean }),
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
        if (
          error instanceof z.ZodError ||
          error instanceof CommandError ||
          error instanceof SessionError
        ) {
          return createVariantError(error)
        }
        throw error
      }
    },
  }
}
