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

const createPatchInputSchema = z.union([
  patchProposalSchema.extend({
    comparisonAxis: z.string().trim().min(1).max(200),
    alternative: patchProposalSchema,
  }).strict(),
  patchProposalSchema.extend({
    singleProposal: z.literal(true),
  }).strict(),
])

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

const documentedCreatePatchInputs = [
  {
    description: 'Warm bass A - harmonic profile: rounded sub-heavy sine',
    attributes: { category: 'bass', brightness: 0.2, drive: 0.1 },
    comparisonAxis: 'harmonic profile',
    alternative: {
      description: 'Warm bass B - harmonic profile: saturated analog saw',
      attributes: { category: 'lead', brightness: 0.55, drive: 0.75 },
    },
  },
  {
    description: 'One pluck with a short attack and medium release',
    attributes: { category: 'pluck', attack: 0.05, release: 0.5 },
    singleProposal: true,
  },
] as const

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
    title: 'Create contrasting A/B proposals or one explicit patch',
    description:
      'Create contrasting A/B proposals by default so unresolved, subjective, exploratory, or character-choice directions can be auditioned simultaneously rather than guessed. Examples include warm bass harmonic profile (rounded sub-heavy sine versus saturated analog saw) and dreamy pad motion (slow strings versus gated ambient). A high-impact but unambiguous replacement may be direct: set singleProposal to true only for an exact, settled, or explicitly single request. Paired creation requires a named comparisonAxis, replaces any prior B, and leaves A active. This is comparison, not undo; use undo only to reverse an already committed transaction.',
    inputSchema: {
      examples: documentedCreatePatchInputs,
      oneOf: [
        {
          type: 'object',
          description: 'Default paired contract for subjective or exploratory musical judgment.',
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 500, description: 'Proposal A intent.' },
            attributes: attributesJsonSchema,
            comparisonAxis: { type: 'string', minLength: 1, maxLength: 200, description: 'The concise musical dimension A and B deliberately contrast, such as harmonic profile or motion character.' },
            alternative: {
              type: 'object',
              description: 'Required B proposal for comparison. Give subjective, exploratory, and character-choice requests two musically useful interpretations.',
              properties: { description: { type: 'string', minLength: 1, maxLength: 500 }, attributes: attributesJsonSchema },
              required: ['description'],
              additionalProperties: false,
            },
          },
          required: ['description', 'comparisonAxis', 'alternative'],
          additionalProperties: false,
        },
        {
          type: 'object',
          description: 'A-only contract for an exact, settled, or explicitly single request.',
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 500, description: 'Exact single proposal intent.' },
            attributes: attributesJsonSchema,
            singleProposal: { type: 'boolean', const: true, description: 'Explicitly confirms that only A should be created.' },
          },
          required: ['description', 'singleProposal'],
          additionalProperties: false,
        },
      ],
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      try {
        const parsed = createPatchInputSchema.parse(input)
        const primaryPatch = buildPatch(parsed)
        if ('singleProposal' in parsed) {
          const result = commandService.createPatch(
            { type: 'create_patch', reason: parsed.description, patch: primaryPatch },
            { source: 'webmcp' },
            null,
          )
          return {
            ...writeToolResult(result),
            description: describePatch(result.patch),
            variants: {
              A: { name: primaryPatch.metadata.name, description: describePatch(primaryPatch) },
              B: null,
            },
          }
        }

        const alternativePatch = buildPatch(parsed.alternative)
        const result = commandService.createPatchPair(
          { type: 'create_patch', reason: parsed.description, patch: primaryPatch },
          {
            type: 'create_patch',
            reason: parsed.alternative.description,
            patch: alternativePatch,
          },
          parsed.comparisonAxis,
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
