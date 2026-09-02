import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { applyPatchChanges } from '../commands/applyPatch'
import { describePatch } from '../patch/describe'
import { resolveOps } from '../ops/resolve'
import { selectArticulation } from '../ops/articulationSelection'
import type { Change } from '../ops/types'
import { getTemplatePatch, TEMPLATE_CATEGORIES, type TemplateCategory } from '../presets/templates'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

const createPatchInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  attributes: z.object({
    category: z.enum(TEMPLATE_CATEGORIES).optional(),
    brightness: z.number().finite().min(0).max(1).optional(),
    movement: z.number().finite().min(0).max(1).optional(),
    width: z.number().finite().min(0).max(1).optional(),
    space: z.number().finite().min(0).max(1).optional(),
    drive: z.number().finite().min(0).max(1).optional(),
    attack: z.number().finite().min(0).max(1).optional(),
    release: z.number().finite().min(0).max(1).optional(),
  }).strict().optional(),
}).strict()

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
  _session: SessionService,
): WebMcpToolDefinition {
  return {
    name: 'create_patch',
    title: 'Create a patch from a validated template',
    description:
      'Start from a known-valid category template, resolve normalized musical attributes as operations, and commit the result as one undoable transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise musical intent, stored as the patch description and undo reason.',
        },
        attributes: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: [...TEMPLATE_CATEGORIES] },
            brightness: { type: 'number', minimum: 0, maximum: 1 },
            movement: { type: 'number', minimum: 0, maximum: 1 },
            width: { type: 'number', minimum: 0, maximum: 1 },
            space: { type: 'number', minimum: 0, maximum: 1 },
            drive: { type: 'number', minimum: 0, maximum: 1 },
            attack: { type: 'number', minimum: 0, maximum: 1 },
            release: { type: 'number', minimum: 0, maximum: 1 },
          },
          additionalProperties: false,
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const parsed = createPatchInputSchema.parse(input)
        const { description, attributes = {} } = parsed
        const category = (attributes.category ?? 'pad') as TemplateCategory
        const template = getTemplatePatch(category)
        const changes: Change[] = [{ path: 'metadata.description', value: description }]
        if (attributes.brightness !== undefined) changes.push({ op: 'tone', brightness: attributes.brightness })
        if (attributes.movement !== undefined) changes.push({ op: 'movement', amount: attributes.movement })
        if (attributes.width !== undefined) changes.push({ op: 'width', amount: attributes.width })
        if (attributes.space !== undefined) changes.push({ op: 'space', amount: attributes.space })
        if (attributes.drive !== undefined) changes.push({ op: 'drive', amount: attributes.drive })
        if (attributes.attack !== undefined || attributes.release !== undefined) {
          changes.push({ op: 'articulation', kind: selectArticulation(attributes) })
        }
        const patch = applyPatchChanges(template, {
          type: 'apply_patch', reason: description, changes: resolveOps(template, changes),
        })
        const result = commandService.createPatch(
          {
            type: 'create_patch',
            reason: description,
            patch,
          },
          { source: 'webmcp' },
        )
        return { ...writeToolResult(result), description: describePatch(result.patch) }
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof CommandError) {
          return createPatchError(error)
        }
        throw error
      }
    },
  }
}
