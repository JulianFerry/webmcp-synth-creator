import { z } from 'zod'

import { sectionValue, type PatchSection } from '../patch/sections'
import { SessionService } from '../session/SessionService'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export const READABLE_PATCH_SECTIONS = [
  'osc1', 'osc2', 'osc3', 'amp_env', 'mod_env', 'lfo1', 'lfo2', 'filter', 'effects', 'voice',
] as const satisfies readonly PatchSection[]

const inputSchema = z.object({ section: z.enum(READABLE_PATCH_SECTIONS) }).strict()

export function createGetSectionTool(session: SessionService): WebMcpToolDefinition {
  return {
    name: 'get_section',
    title: 'Read one patch section',
    description: 'Read full detail for one patch section. voice.mode is derived from voice.polyphony and is not writable.',
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', enum: [...READABLE_PATCH_SECTIONS] } },
      required: ['section'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      const { section } = inputSchema.parse(input)
      return { section, current: sectionValue(session.getPatch(), section) }
    },
  }
}
