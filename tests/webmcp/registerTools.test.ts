import { describe, expect, it } from 'vitest'

import { CommandService } from '../../src/commands/CommandService'
import { PatchHistory } from '../../src/commands/history'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SUPPORTED_PATCH_PATHS } from '../../src/patch/paths'
import { ARTICULATION_PRESETS } from '../../src/ops/articulationAndLayer'
import { normalizedToCutoffHz, normalizedToReverbDecaySeconds } from '../../src/ops/normalization'
import { getTemplatePatch } from '../../src/presets/templates'
import { SessionService } from '../../src/session/SessionService'
import type {
  ModelContextGateway,
  WebMcpToolDefinition,
} from '../../src/webmcp/ModelContextGateway'
import { UnavailableModelContextGateway } from '../../src/webmcp/ModelContextGateway'
import { registerTools } from '../../src/webmcp/registerTools'
import type { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

class CapturingGateway implements ModelContextGateway {
  readonly available = true
  readonly registrations: Array<{ tool: WebMcpToolDefinition; signal: AbortSignal }> = []

  async registerTool(
    tool: WebMcpToolDefinition,
    options: { signal: AbortSignal },
  ): Promise<void> {
    await Promise.resolve()
    this.registrations.push({ tool, signal: options.signal })
  }
}

function createHarness() {
  const session = new SessionService(createDefaultPatch())
  const commands = new CommandService(session, new PatchHistory(), new LatencyTrace(false))
  return { session, commands }
}

function expectAffectedSections(result: unknown, sections: string[], undoStep: number) {
  const response = result as { current: Record<string, unknown>; undo_step: number }
  expect(Object.keys(response.current)).toEqual(sections)
  expect(response.undo_step).toBe(undoStep)
}

describe('WebMCP tool registration', () => {
  it('asynchronously registers patch and session tools with current annotations and schemas', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    const pendingRegistration = registerTools(gateway, session, commands)

    expect(gateway.registrations).toHaveLength(0)
    const registration = await pendingRegistration
    expect(registration.status).toBe('available')
    expect(gateway.registrations.map(({ tool }) => tool.name)).toEqual([
      'get_patch',
      'get_section',
      'get_capabilities',
      'apply_patch',
      'set_lfo_shape',
      'set_lfo_point',
      'create_variant',
      'select_variant',
      'undo',
      'redo',
      'create_patch',
      'list_presets',
      'load_preset',
      'describe_patch',
      'export_patch',
    ])

    const tool = (name: string) => gateway.registrations.find(({ tool }) => tool.name === name)!.tool
    const getPatch = tool('get_patch')
    const applyPatch = tool('apply_patch')
    const setLfoShape = tool('set_lfo_shape')
    const setLfoPoint = tool('set_lfo_point')
    expect(getPatch.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: false })
    expect(applyPatch.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false })
    expect(setLfoShape.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
    })
    expect(setLfoPoint.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
    })
    for (const toolName of ['get_patch', 'get_section', 'get_capabilities', 'list_presets', 'describe_patch']) {
      expect(tool(toolName).annotations).toEqual({ readOnlyHint: true, untrustedContentHint: false })
    }
    for (const toolName of ['create_variant', 'select_variant', 'undo', 'redo']) {
      expect(gateway.registrations.find(({ tool }) => tool.name === toolName)?.tool.annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
      })
    }
    for (const toolName of ['create_patch', 'load_preset', 'export_patch']) {
      expect(gateway.registrations.find(({ tool }) => tool.name === toolName)?.tool.annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
      })
    }
    expect(getPatch.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(applyPatch.inputSchema).toMatchObject({
      type: 'object',
      required: ['reason', 'changes'],
      additionalProperties: false,
      examples: [
        {
          reason: 'Make the held patch darker',
          changes: [{ path: 'filter.cutoffHz', value: 3200 }],
        },
      ],
    })
    const applyChangeUnion = (applyPatch.inputSchema.properties as any).changes.items.oneOf
    expect(applyChangeUnion).toHaveLength(13)
    expect(applyChangeUnion.slice(0, 12).map((schema: any) => schema.properties.op.const)).toEqual([
      'tone', 'articulation', 'timbre', 'width', 'space', 'drive',
      'movement', 'gate', 'balance', 'layer', 'pitch', 'response',
    ])
    const createVariant = gateway.registrations.find(({ tool }) => tool.name === 'create_variant')!.tool
    const variantChangeUnion = (createVariant.inputSchema.properties as any).changes.items.oneOf
    expect(variantChangeUnion).toEqual(applyChangeUnion)
    expect(createVariant.description).toContain('variant B becomes the active variant')
    expect(applyPatch.description).toContain('filter.cutoffHz = cutoffHz(0.12 + brightness*0.80')
    expect(applyPatch.description).toContain("t' = t * (0.25 + speed*1.5)")
    expect(applyPatch.description).toContain('voice.transposeSemitones = clamp(')
    expect(applyPatch.description).toContain('Routes reaching amount 0 are removed')
    expect(applyPatch.description).toMatch(/Prefer operations over raw paths[\s\S]*call to this tool\.$/)
    expect(setLfoShape.inputSchema).toMatchObject({
      type: 'object',
      required: ['reason', 'points'],
      additionalProperties: false,
    })
    expect(setLfoShape.description).toContain('boolean smooth')
    expect(setLfoShape.description).toContain('output slew')
    expect(setLfoPoint.inputSchema).toMatchObject({
      type: 'object',
      required: ['reason', 'index'],
      additionalProperties: false,
    })
  })

  it('executes an operation and returns only its affected sections', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const applyPatch = gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool

    const result = await applyPatch.execute({
      reason: 'Make the patch darker but retain air',
      changes: [{ op: 'tone', brightness: 0.2, keep_air: true }],
    })

    expect(result).toMatchObject({
      changed: {
        'filter.cutoffHz': { before: 7200, after: expect.any(Number) },
      },
      current: { filter: { slope: 12 } },
      undo_step: 1,
    })
    expect(result).not.toHaveProperty('summary')
    expect((result as { current: object }).current).toEqual({ filter: session.getPatch().filter })
    expectAffectedSections(result, ['filter'], 1)
  })

  it('creates and activates variant B from an operation change', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const createVariant = gateway.registrations.find(
      ({ tool }) => tool.name === 'create_variant',
    )!.tool

    const result = await createVariant.execute({
      description: 'Create a darker B alternative',
      changes: [{ op: 'tone', brightness: 0.15, keep_air: false }],
    })

    expect(result).toMatchObject({
      changed: { 'filter.cutoffHz': { before: 7200, after: expect.any(Number) } },
      current: { filter: { slope: 24 } },
      undo_step: 1,
      session: { currentVariant: 'B', hasVariantB: true },
    })
    expectAffectedSections(result, ['filter'], 1)
    expect(session.getSummary().currentVariant).toBe('B')
    expect(session.getPatch('A').filter.cutoffHz).toBe(7200)
  })

  it('returns plain JSON-serializable read and write results', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const executionController = new AbortController()

    const readResult = await gateway.registrations[0].tool.execute(
      {},
      { signal: executionController.signal },
    )
    expect(JSON.parse(JSON.stringify(readResult))).toMatchObject({
      version: 3,
      name: 'Ethereal Gate',
      oscillators: expect.arrayContaining([
        expect.objectContaining({ unisonDetune: 0.36, randomPhase: 0.7 }),
      ]),
      filter: { cutoffHz: 7200 },
      lfo1: { enabled: true },
      session: { currentVariant: 'A', hasVariantB: false, canUndo: false, canRedo: false },
    })

    const writeResult = await gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool.execute(
      {
        reason: 'Lower the filter in one transaction',
        changes: [{ path: 'filter.cutoffHz', value: 3600 }],
      },
      { signal: executionController.signal },
    )
    expect(JSON.parse(JSON.stringify(writeResult))).toMatchObject({
      changed: { 'filter.cutoffHz': { before: 7200, after: 3600 } },
      current: { filter: { cutoffHz: 3600 } },
      undo_step: 1,
      canUndo: true,
    })
    expect(writeResult).not.toHaveProperty('content')
    expectAffectedSections(writeResult, ['filter'], 1)
  })

  it('executes the documented Inspector JSON after Chrome JSON serialization', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const applyPatch = gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool
    const [schemaExample] = applyPatch.inputSchema.examples as Record<string, unknown>[]
    const inspectorInput = JSON.parse(JSON.stringify(schemaExample)) as Record<string, unknown>

    expect(inspectorInput).toEqual({
      reason: 'Make the held patch darker',
      changes: [{ path: 'filter.cutoffHz', value: 3200 }],
    })
    await expect(applyPatch.execute(inspectorInput)).resolves.toMatchObject({
      changed: { 'filter.cutoffHz': { before: 7200, after: 3200 } },
      current: { filter: { cutoffHz: 3200 } },
      undo_step: 1,
      canUndo: true,
    })
  })

  it('returns a useful JSON error for the old Inspector schema-derived object value', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const applyPatch = gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool

    const result = await applyPatch.execute({
      reason: 'example_string',
      changes: [{ path: 'metadata.name', value: {} }],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_APPLY_PATCH_INPUT',
        message:
          'Invalid apply_patch input at changes.0.value: Expected string, received object',
        issues: [
          {
            path: 'changes.0.value',
            message: 'Expected string, received object',
          },
        ],
      },
    })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    expect(session.getPatch().metadata.name).toBe('Ethereal Gate')
    expect(commands.historySize).toBe(0)
  })

  it('executes both tools when Chrome omits the execution context', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)

    const readResult = await gateway.registrations[0].tool.execute({})
    expect(readResult).toMatchObject({
      name: 'Ethereal Gate',
      filter: { cutoffHz: 7200 },
    })

    const writeResult = await gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool.execute({
      reason: 'Lower the filter without an execution context',
      changes: [{ path: 'filter.cutoffHz', value: 3600 }],
    })
    expect(writeResult).toMatchObject({
      changed: { 'filter.cutoffHz': { before: 7200, after: 3600 } },
      current: { filter: { cutoffHz: 3600 } },
      canUndo: true,
    })
  })

  it('edits LFO points in one transaction while preserving rate and routes', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const setLfoShape = gateway.registrations.find(
      ({ tool }) => tool.name === 'set_lfo_shape',
    )!.tool
    const before = session.getPatch()
    const points = [
      { x: 0, y: 0 },
      { x: 0.02, y: 1 },
      { x: 0.11, y: 0 },
      { x: 1, y: 0 },
    ]

    const result = await setLfoShape.execute({
      reason: 'Shorten the second pulse',
      points,
    })

    expect(result).toMatchObject({
      changed: { 'lfo1.points': { before: before.lfo1.points, after: points } },
      current: { lfo: { enabled: true, points, rate: before.lfo1.rate } },
      canUndo: true,
    })
    expect(session.getPatch().modulations).toEqual(before.modulations)
    expect(commands.historySize).toBe(1)
    expect(result).not.toHaveProperty('content')
    expectAffectedSections(result, ['lfo'], 1)
  })

  it('edits one LFO point through the focused tool', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const setLfoPoint = gateway.registrations.find(
      ({ tool }) => tool.name === 'set_lfo_point',
    )!.tool
    const before = session.getPatch()

    const result = await setLfoPoint.execute({
      reason: 'Shorten the second pulse', index: 4, x: 0.35,
    })

    expect(result).toMatchObject({
      changed: { 'lfo1.points': { before: before.lfo1.points } },
      current: { lfo: { points: expect.arrayContaining([{ x: 0.35, y: 0 }]) } },
      undo_step: 1,
    })
    expect(session.getPatch().lfo1.points[4].x).toBe(0.35)
    expect(session.getPatch().modulations).toEqual(before.modulations)
    expectAffectedSections(result, ['lfo'], 1)
  })

  it('rejects a combined final-point coordinate and power edit atomically', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const setLfoPoint = gateway.registrations.find(
      ({ tool }) => tool.name === 'set_lfo_point',
    )!.tool
    const before = session.getPatch()

    await expect(setLfoPoint.execute({
      reason: 'Move and curve the final point',
      index: before.lfo1.points.length - 1,
      x: 0.75,
      y: 0.5,
      power: 0.5,
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'LFO_POINT_NOT_CHANGED',
        message: 'Curve power cannot be set on the final LFO point',
      },
    })
    expect(session.getPatch()).toEqual(before)
    expect(commands.historySize).toBe(0)
  })

  it('reports LFO enablement and preserves retained configuration through apply_patch', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const applyPatch = gateway.registrations.find(({ tool }) => tool.name === 'apply_patch')!.tool
    const before = session.getPatch()

    const result = await applyPatch.execute({
      reason: 'Disable LFO modulation but retain its setup',
      changes: [{ path: 'lfo1.enabled', value: false }],
    })

    expect(result).toMatchObject({
      changed: { 'lfo1.enabled': { before: true, after: false } },
      current: { lfo: { enabled: false, points: before.lfo1.points, rate: before.lfo1.rate } },
    })
    expect(session.getPatch().modulations).toEqual(before.modulations)
    expectAffectedSections(result, ['lfo'], 1)
  })

  it('reports absent B and keeps every session write result scoped to the active variant', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const tool = (name: string) =>
      gateway.registrations.find(({ tool: candidate }) => candidate.name === name)!.tool

    await expect(tool('get_patch').execute({})).resolves.toMatchObject({
      name: 'Ethereal Gate',
      session: { currentVariant: 'A', hasVariantB: false, canUndo: false, canRedo: false },
    })
    await expect(tool('select_variant').execute({ variant: 'B' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'VARIANT_B_UNAVAILABLE',
        message: 'Variant B does not exist',
      },
    })

    const created = await tool('create_variant').execute({
      description: 'Create a wider B alternative',
      changes: [
        { path: 'metadata.name', value: 'Ethereal Gate Wide B' },
        { path: 'oscillators.0.stereoSpread', value: 1 },
      ],
    })
    expect(created).toMatchObject({
      changed: {
        'metadata.name': { before: 'Ethereal Gate', after: 'Ethereal Gate Wide B' },
        'oscillators.0.stereoSpread': { before: 0.88, after: 1 },
      },
      current: { metadata: { name: 'Ethereal Gate Wide B' }, osc1: { stereoSpread: 1 } },
      canUndo: true,
      canRedo: false,
      session: { currentVariant: 'B', hasVariantB: true },
    })
    expect(created).not.toHaveProperty('content')
    expectAffectedSections(created, ['metadata', 'osc1'], 1)
    expect(session.getPatch('A').metadata.name).toBe('Ethereal Gate')
    await expect(tool('get_patch').execute({})).resolves.toMatchObject({
      name: 'Ethereal Gate Wide B',
      session: { currentVariant: 'B', hasVariantB: true, canUndo: true, canRedo: false },
    })

    const undone = await tool('undo').execute({})
    expect(undone).toMatchObject({
      current: { metadata: { name: 'Ethereal Gate' } },
      canUndo: false,
      canRedo: true,
      session: { currentVariant: 'B' },
    })
    expectAffectedSections(undone, ['metadata', 'osc1'], 0)
    const redone = await tool('redo').execute({})
    expect(redone).toMatchObject({
      current: { metadata: { name: 'Ethereal Gate Wide B' } },
      canUndo: true,
      canRedo: false,
      session: { currentVariant: 'B' },
    })
    expectAffectedSections(redone, ['metadata', 'osc1'], 1)

    const selectedA = await tool('select_variant').execute({ variant: 'A' })
    expect(selectedA).toMatchObject({
      current: { metadata: { name: 'Ethereal Gate' } },
      canUndo: false,
      canRedo: false,
      session: { currentVariant: 'A', hasVariantB: true },
    })
    expectAffectedSections(selectedA, ['metadata', 'osc1'], 0)
    expect(session.getPatch('B').metadata.name).toBe('Ethereal Gate Wide B')
    await expect(tool('get_patch').execute({})).resolves.toMatchObject({
      name: 'Ethereal Gate',
      session: { currentVariant: 'A', hasVariantB: true, canUndo: false, canRedo: false },
    })
  })

  it('lists, loads, and creates patches through plain JSON tool results', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const tool = (name: string) =>
      gateway.registrations.find(({ tool: candidate }) => candidate.name === name)!.tool

    await expect(tool('list_presets').execute({ category: 'pad' })).resolves.toEqual([
      expect.objectContaining({ id: 'ethereal-gate', category: 'pad' }),
      expect.objectContaining({ id: 'midnight-pad', category: 'pad' }),
    ])

    const loaded = await tool('load_preset').execute({ presetId: 'glass-pluck' })
    expect(loaded).toMatchObject({
      current: { metadata: { name: 'Glass Pluck', category: 'pluck' } },
      session: { currentVariant: 'A', canUndo: true },
    })
    expect(loaded).not.toHaveProperty('content')
    expectAffectedSections(loaded, [
      'metadata', 'osc1', 'osc2', 'osc3', 'amp_env', 'mod_env', 'filter',
      'lfo', 'modulations', 'voice', 'effects', 'wavetables',
    ], 1)

    const created = await tool('create_patch').execute({
      description: 'Create a bright, wide percussion patch',
      attributes: { category: 'percussion', brightness: 0.8, width: 0.7, attack: 0.1 },
    })
    expect(created).toMatchObject({
      current: { metadata: { name: 'Percussion Template', category: 'pluck' } },
      session: { currentVariant: 'A', canUndo: true },
      description: expect.any(String),
    })
    expect(commands.historySize).toBe(2)
    expect((created as { undo_step: number }).undo_step).toBe(2)
    expect(session.getPatch().metadata.description).toBe('Create a bright, wide percussion patch')
    expect(session.getPatch().oscillators[0].unisonVoices).toBeGreaterThan(1)
  })

  it('creates every template category and applies every normalized attribute in one transaction', async () => {
    for (const category of ['bass', 'pad', 'pluck', 'lead', 'keys', 'strings', 'brass', 'vocal', 'bell', 'arp', 'ambient', 'cinematic', 'fx', 'percussion']) {
      const gateway = new CapturingGateway()
      const { commands, session } = createHarness()
      await registerTools(gateway, session, commands)
      const createPatch = gateway.registrations.find(({ tool }) => tool.name === 'create_patch')!.tool
      const result = await createPatch.execute({
        description: `${category} attribute coverage`,
        attributes: { category, brightness: 0.8, movement: 0.4, width: 0.7, space: 0.6, drive: 0.5, attack: 0.2, release: 0.8 },
      }) as { undo_step: number }

      expect(result.undo_step).toBe(1)
      expect(commands.historySize).toBe(1)
      expect(session.getPatch().metadata.tags).toContain(category)
      expect(session.getPatch().metadata.description).toBe(`${category} attribute coverage`)
    }
  })

  it.each([
    ['brightness', { brightness: 0.8 }, (patch: ReturnType<typeof getTemplatePatch>) => {
      expect(patch.filter).toMatchObject({ enabled: true, type: 'lowpass', slope: 24, cutoffHz: normalizedToCutoffHz(0.76) })
    }],
    ['movement', { movement: 0.4 }, (patch: ReturnType<typeof getTemplatePatch>) => {
      expect(patch.lfo1).toMatchObject({ enabled: true, rate: { mode: 'sync', division: '1/1' }, smoothing: 0.4 })
      expect(patch.modulations).toEqual([expect.objectContaining({ source: 'lfo1', destination: 'oscillator1.wavetablePosition', amount: 0.24, bipolar: true })])
    }],
    ['width', { width: 0.7 }, (patch: ReturnType<typeof getTemplatePatch>) => {
      expect(patch.oscillators[0]).toMatchObject({ unisonVoices: 7, unisonDetune: 0.7 * 0.7, stereoSpread: 0.3 + 0.7 * 0.7 })
      expect(patch.effects.chorus).toMatchObject({ enabled: true, mix: 0.7 * 0.5 })
    }],
    ['space', { space: 0.6 }, (patch: ReturnType<typeof getTemplatePatch>) => {
      expect(patch.effects.reverb).toMatchObject({ enabled: true, mix: 0.6 * 0.75, decaySeconds: normalizedToReverbDecaySeconds(0.6), predelay: 0.1 })
    }],
    ['drive', { drive: 0.5 }, (patch: ReturnType<typeof getTemplatePatch>) => {
      expect(patch.effects.distortion).toMatchObject({ enabled: true, type: 'soft_clip', drive: 0.5, mix: 0.7 })
      expect(patch.filter.drive).toBe(0.2)
    }],
  ] as const)('applies the %s create_patch attribute with its exact semantic effect', async (_name, attribute, assertPatch) => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const createPatch = gateway.registrations.find(({ tool }) => tool.name === 'create_patch')!.tool

    const result = await createPatch.execute({ description: `${_name} only`, attributes: { category: 'pad', ...attribute } }) as { undo_step: number }
    assertPatch(session.getPatch())
    expect(result.undo_step).toBe(1)
    expect(commands.historySize).toBe(1)
  })

  it.each([
    ['attack-only', { attack: 0.1 }, ARTICULATION_PRESETS.sustain],
    ['release-only', { release: 0.8 }, ARTICULATION_PRESETS.bell],
  ] as const)('maps %s through articulation selection to the full envelope in one transaction', async (_name, attribute, envelope) => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const createPatch = gateway.registrations.find(({ tool }) => tool.name === 'create_patch')!.tool

    const result = await createPatch.execute({ description: _name, attributes: attribute }) as { undo_step: number }
    expect(session.getPatch().ampEnvelope).toEqual(envelope)
    expect(result.undo_step).toBe(1)
    expect(commands.historySize).toBe(1)
  })

  it('defaults create_patch to the pad template in one transaction', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const createPatch = gateway.registrations.find(({ tool }) => tool.name === 'create_patch')!.tool

    const result = await createPatch.execute({ description: 'Default category' }) as { undo_step: number }
    expect(session.getPatch()).toEqual({ ...getTemplatePatch('pad'), metadata: { ...getTemplatePatch('pad').metadata, description: 'Default category' } })
    expect(result.undo_step).toBe(1)
    expect(commands.historySize).toBe(1)
  })

  it('normalizes create_patch validation errors without committing', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const createPatch = gateway.registrations.find(({ tool }) => tool.name === 'create_patch')!.tool
    const before = session.getPatch()

    for (const input of [
      {},
      { description: '' },
      { description: 'bad category', attributes: { category: 'drums' } },
      { description: 'bad amount', attributes: { brightness: 2 } },
      { description: 'unknown attribute', attributes: { mystery: 0.5 } },
    ]) {
      await expect(createPatch.execute(input)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_CREATE_PATCH_INPUT' } })
    }
    expect(commands.historySize).toBe(0)
    expect(session.getPatch()).toEqual(before)
  })

  it('executes describe_patch read-only against current state', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const describeTool = gateway.registrations.find(({ tool }) => tool.name === 'describe_patch')!.tool
    expect(describeTool.annotations.readOnlyHint).toBe(true)

    const before = session.getPatch()
    await expect(describeTool.execute({})).resolves.toEqual({ description: expect.any(String) })
    expect(session.getPatch()).toEqual(before)
    expect(commands.historySize).toBe(0)
  })

  it('reports capabilities and full section detail from validator-backed constants', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const tool = (name: string) => gateway.registrations.find(({ tool }) => tool.name === name)!.tool

    const capabilities = await tool('get_capabilities').execute({}) as {
      rawPaths: Array<{ path: string; unit: string }>
      [key: string]: unknown
    }
    expect(capabilities).toMatchObject({
      modulationSources: ['lfo1', 'modEnvelope', 'velocity'],
      filterTypes: ['lowpass', 'highpass', 'bandpass', 'notch'],
      filterSlopesDbPerOctave: [12, 24],
      distortionTypes: ['soft_clip', 'hard_clip', 'sine_fold', 'bit_crush'],
      wavetables: expect.arrayContaining([
        { id: 'glass', name: 'Generated Glass', character: 'Sparse inharmonic partials for a clear, struck-glass character.' },
      ]),
      templateCategories: expect.arrayContaining(['bass', 'percussion']),
      rawPaths: expect.arrayContaining([
        { path: 'filter.cutoffHz', unit: 'hertz' },
        { path: 'voice.polyphony', unit: 'voice count' },
      ]),
    })
    expect(capabilities.rawPaths.map(({ path }) => path)).toEqual([...SUPPORTED_PATCH_PATHS])
    expect(capabilities.rawPaths.every(({ unit }) => unit.length > 0)).toBe(true)
    const expectedSections = {
      osc1: session.getPatch().oscillators[0],
      osc2: session.getPatch().oscillators[1],
      osc3: session.getPatch().oscillators[2],
      amp_env: session.getPatch().ampEnvelope,
      mod_env: session.getPatch().modEnvelope,
      lfo: session.getPatch().lfo1,
      filter: session.getPatch().filter,
      effects: session.getPatch().effects,
      voice: { ...session.getPatch().voice, mode: 'poly' },
      modulations: session.getPatch().modulations,
    }
    for (const [section, current] of Object.entries(expectedSections)) {
      await expect(tool('get_section').execute({ section })).resolves.toEqual({ section, current })
    }
  })

  it('exports through the threaded adapter and fails cleanly before Vital is ready', async () => {
    const unavailableGateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(unavailableGateway, session, commands)
    const unavailable = unavailableGateway.registrations.find(({ tool }) => tool.name === 'export_patch')!.tool
    await expect(unavailable.execute({})).resolves.toEqual({
      ok: false,
      error: { code: 'VITAL_NOT_READY', message: 'Vital export is not ready' },
    })

    const adapter = {
      exportPatch: () => ({ document: { valid: true }, filename: 'default.vital', json: '{}' }),
      importPatchStrict: () => ({ patch: session.getPatch(), warnings: [], sourceVersion: '1.0.7' }),
      downloadPatch: (_patch: unknown, filename?: string) => `${filename}.vital`,
    } as unknown as VitalPresetAdapter
    const gateway = new CapturingGateway()
    await registerTools(gateway, session, commands, {
      snapshot: () => ({ adapter, status: 'ready' }),
    })
    const exportPatch = gateway.registrations.find(({ tool }) => tool.name === 'export_patch')!.tool
    await expect(exportPatch.execute({ filename: 'agent-export' })).resolves.toEqual({
      filename: 'agent-export.vital',
      validation: { valid: true, mode: 'strict', warnings: [] },
    })
  })

  it('returns one normalized write error for duplicate B, empty undo, and empty redo', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const tool = (name: string) =>
      gateway.registrations.find(({ tool: candidate }) => candidate.name === name)!.tool

    await expect(tool('undo').execute({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOTHING_TO_UNDO' },
    })
    await expect(tool('redo').execute({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOTHING_TO_REDO' },
    })

    const input = {
      description: 'Create B',
      changes: [{ path: 'metadata.name', value: 'Variant B' }],
    }
    await tool('create_variant').execute(input)
    await expect(tool('create_variant').execute(input)).resolves.toEqual({
      ok: false,
      error: {
        code: 'VARIANT_B_ALREADY_EXISTS',
        message:
          'Variant B already exists. Set replaceExisting to true to replace it explicitly.',
      },
    })

    await expect(
      tool('create_variant').execute({
        description: 'Explicitly replace B',
        changes: [{ path: 'filter.cutoffHz', value: 4100 }],
        replaceExisting: true,
      }),
    ).resolves.toMatchObject({
      current: { filter: { cutoffHz: 4100 } },
      session: { currentVariant: 'B', hasVariantB: true, canUndo: true, canRedo: false },
    })
  })

  it('uses one AbortSignal to clean up all registrations', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    const registration = await registerTools(gateway, session, commands)

    expect(new Set(gateway.registrations.map(({ signal }) => signal)).size).toBe(1)
    expect(registration.signal?.aborted).toBe(false)
    registration.dispose()
    expect(registration.signal?.aborted).toBe(true)
  })

  it('reports unavailable capability without attempting registration', async () => {
    const gateway = new UnavailableModelContextGateway('Testing flag is disabled')
    const { commands, session } = createHarness()
    const registration = await registerTools(gateway, session, commands)

    expect(registration).toMatchObject({
      status: 'unavailable',
      reason: 'Testing flag is disabled',
      tools: [],
      signal: null,
    })
    expect(() => registration.dispose()).not.toThrow()
  })

  it('honors an aborted execution signal for both tools', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    await registerTools(gateway, session, commands)
    const controller = new AbortController()
    controller.abort(new DOMException('Cancelled', 'AbortError'))
    const inputs: Record<string, Record<string, unknown>> = {
      get_patch: {},
      apply_patch: {
        reason: 'This transaction must be cancelled',
        changes: [{ path: 'filter.cutoffHz', value: 3600 }],
      },
      set_lfo_shape: {
        reason: 'This LFO transaction must be cancelled',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      set_lfo_point: {
        reason: 'This point transaction must be cancelled',
        index: 1,
        y: 0.5,
      },
      get_section: { section: 'filter' },
      get_capabilities: {},
      create_variant: {
        description: 'This B transaction must be cancelled',
        changes: [{ path: 'metadata.name', value: 'Cancelled B' }],
      },
      select_variant: { variant: 'A' },
      undo: {},
      redo: {},
      create_patch: {
        reason: 'This complete patch creation must be cancelled',
        patch: session.getPatch(),
      },
      load_preset: { presetId: 'glass-pluck' },
      describe_patch: {},
      export_patch: {},
      list_presets: {},
    }

    await Promise.all(
      gateway.registrations.map(({ tool }) =>
        expect(tool.execute(inputs[tool.name], { signal: controller.signal })).rejects.toMatchObject({
          name: 'AbortError',
        }),
      ),
    )
    expect(session.getPatch().filter.cutoffHz).toBe(7200)
  })
})
