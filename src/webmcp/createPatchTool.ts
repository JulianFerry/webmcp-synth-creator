import { z } from 'zod'

import { CommandError, CommandService } from '../commands/CommandService'
import { applyPatchChanges } from '../commands/applyPatch'
import { describePatch } from '../patch/describe'
import { resolveOps } from '../ops/resolve'
import { selectArticulation } from '../ops/articulationSelection'
import type { Change } from '../ops/types'
import { getTemplatePatch, TEMPLATE_CATEGORIES, type TemplateCategory } from '../presets/templates'
import type { WebMcpToolDefinition } from './ModelContextGateway'
import { writeToolResult } from './writeResult'

const attributesSchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  brightness: z.number().finite().min(0).max(1).optional(),
  movement: z.number().finite().min(0).max(1).optional(),
  width: z.number().finite().min(0).max(1).optional(),
  space: z.number().finite().min(0).max(1).optional(),
  drive: z.number().finite().min(0).max(1).optional(),
  attack: z.number().finite().min(0).max(1).optional(),
  release: z.number().finite().min(0).max(1).optional(),
}).strict()

const patchProposalSchema = z.object({
  description: z.string().trim().min(1).max(500),
  attributes: attributesSchema.optional(),
}).strict()

const createPatchInputSchema = patchProposalSchema.extend({
  alternative: patchProposalSchema.optional(),
}).strict()

type PatchProposal = z.infer<typeof patchProposalSchema>

function buildPatch({ description, attributes = {} }: PatchProposal) {
  const category = (attributes.category ?? 'pad') as TemplateCategory
  const template = getTemplatePatch(category)
  const changes: Change[] = [
    { path: 'metadata.name', value: description },
    { path: 'metadata.description', value: description },
  ]
  if (attributes.brightness !== undefined) changes.push({ op: 'tone', brightness: attributes.brightness })
  if (attributes.movement !== undefined) changes.push({ op: 'movement', amount: attributes.movement })
  if (attributes.width !== undefined) changes.push({ op: 'width', amount: attributes.width })
  if (attributes.space !== undefined) changes.push({ op: 'space', amount: attributes.space })
  if (attributes.drive !== undefined) changes.push({ op: 'drive', amount: attributes.drive })
  if (attributes.attack !== undefined || attributes.release !== undefined) {
    changes.push({ op: 'articulation', kind: selectArticulation(attributes) })
  }
  return applyPatchChanges(template, {
    type: 'apply_patch', reason: description, changes: resolveOps(template, changes),
  })
}

const attributesJsonSchema = {
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
} as const

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
): WebMcpToolDefinition {
  return {
    name: 'create_patch',
    title: 'Create a patch from a validated template',
    description:
      'Start from a known-valid category template and commit the result as one undoable transaction. Propose an alternative when the request is genuinely under-determined along a musical axis, such as sub-heavy sine versus saturated analog saw for "warm bass", and name that axis in both descriptions. Do not propose an alternative for a specific request; an unneeded second variant adds audition noise. Paired creation replaces any prior B and leaves variant A active.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Concise musical intent, stored as the patch description and undo reason.',
        },
        attributes: attributesJsonSchema,
        alternative: {
          type: 'object',
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 500 },
            attributes: attributesJsonSchema,
          },
          required: ['description'],
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
        const primaryPatch = buildPatch(parsed)
        if (!parsed.alternative) {
          const result = commandService.createPatch(
            { type: 'create_patch', reason: parsed.description, patch: primaryPatch },
            { source: 'webmcp' },
            null,
          )
          return { ...writeToolResult(result), description: describePatch(result.patch) }
        }

        const alternativePatch = buildPatch(parsed.alternative)
        const result = commandService.createPatchPair(
          { type: 'create_patch', reason: parsed.description, patch: primaryPatch },
          {
            type: 'create_patch',
            reason: parsed.alternative.description,
            patch: alternativePatch,
          },
          { source: 'webmcp' },
        )
        return {
          ...writeToolResult(result),
          description: describePatch(result.patch),
          variants: {
            A: { name: primaryPatch.metadata.name, description: describePatch(primaryPatch) },
            B: { name: alternativePatch.metadata.name, description: describePatch(alternativePatch) },
          },
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
