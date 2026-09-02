import { describe, expect, it } from 'vitest'

import { CommandService } from '../../src/commands/CommandService'
import { PatchHistory } from '../../src/commands/history'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionService } from '../../src/session/SessionService'
import type {
  ModelContextGateway,
  WebMcpToolDefinition,
} from '../../src/webmcp/ModelContextGateway'
import { UnavailableModelContextGateway } from '../../src/webmcp/ModelContextGateway'
import { registerTools } from '../../src/webmcp/registerTools'

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
      'apply_patch',
      'set_lfo_shape',
      'set_lfo_point',
      'get_session_state',
      'create_variant',
      'select_variant',
      'undo',
      'redo',
      'create_patch',
      'list_presets',
      'load_preset',
    ])

    const getPatch = gateway.registrations[0].tool
    const applyPatch = gateway.registrations[1].tool
    const setLfoShape = gateway.registrations[2].tool
    const setLfoPoint = gateway.registrations[3].tool
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
    expect(
      gateway.registrations.find(({ tool }) => tool.name === 'get_session_state')?.tool.annotations,
    ).toEqual({ readOnlyHint: true, untrustedContentHint: false })
    for (const toolName of ['create_variant', 'select_variant', 'undo', 'redo']) {
      expect(gateway.registrations.find(({ tool }) => tool.name === toolName)?.tool.annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
      })
    }
    expect(
      gateway.registrations.find(({ tool }) => tool.name === 'list_presets')?.tool.annotations,
    ).toEqual({ readOnlyHint: true, untrustedContentHint: false })
    for (const toolName of ['create_patch', 'load_preset']) {
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
      name: 'Ethereal Gate',
      filter: { cutoffHz: 7200 },
      lfo1: { enabled: true },
    })

    const writeResult = await gateway.registrations[1].tool.execute(
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
    const applyPatch = gateway.registrations[1].tool
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
    const applyPatch = gateway.registrations[1].tool

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

    const writeResult = await gateway.registrations[1].tool.execute({
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

    await expect(tool('get_session_state').execute({})).resolves.toMatchObject({
      currentVariant: 'A',
      hasVariantB: false,
      canUndo: false,
      canRedo: false,
      summary: { name: 'Ethereal Gate' },
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

    const createdPatch = session.getPatch()
    createdPatch.metadata.name = 'Created Glass Variant'
    createdPatch.filter.cutoffHz = 7600
    const created = await tool('create_patch').execute({
      reason: 'Create a complete glass variation',
      patch: createdPatch,
    })
    expect(created).toMatchObject({
      changed: {
        'metadata.name': { before: 'Glass Pluck', after: 'Created Glass Variant' },
        'filter.cutoffHz': { before: 9200, after: 7600 },
      },
      current: { metadata: { name: 'Created Glass Variant' } },
      session: { currentVariant: 'A', canUndo: true },
    })
    expect(commands.historySize).toBe(2)
    expectAffectedSections(created, ['metadata', 'filter'], 2)
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
      get_session_state: {},
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
      list_presets: {},
      load_preset: { presetId: 'glass-pluck' },
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
