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

describe('WebMCP tool registration', () => {
  it('asynchronously registers only get_patch and apply_patch with current annotations and schemas', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    const pendingRegistration = registerTools(gateway, session, commands)

    expect(gateway.registrations).toHaveLength(0)
    const registration = await pendingRegistration
    expect(registration.status).toBe('available')
    expect(gateway.registrations.map(({ tool }) => tool.name)).toEqual([
      'get_patch',
      'apply_patch',
    ])

    const getPatch = gateway.registrations[0].tool
    const applyPatch = gateway.registrations[1].tool
    expect(getPatch.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: false })
    expect(applyPatch.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false })
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
      summary: { filter: { cutoffHz: 3600 } },
      canUndo: true,
    })
    expect(writeResult).not.toHaveProperty('content')
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
      summary: { filter: { cutoffHz: 3200 } },
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
      summary: { filter: { cutoffHz: 3600 } },
      canUndo: true,
    })
  })

  it('uses one AbortSignal to clean up both registrations', async () => {
    const gateway = new CapturingGateway()
    const { commands, session } = createHarness()
    const registration = await registerTools(gateway, session, commands)

    expect(gateway.registrations[0].signal).toBe(gateway.registrations[1].signal)
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
    const inputs: Record<string, unknown>[] = [
      {},
      {
        reason: 'This transaction must be cancelled',
        changes: [{ path: 'filter.cutoffHz', value: 3600 }],
      },
    ]

    await Promise.all(
      gateway.registrations.map(({ tool }, index) =>
        expect(tool.execute(inputs[index], { signal: controller.signal })).rejects.toMatchObject({
          name: 'AbortError',
        }),
      ),
    )
    expect(session.getPatch().filter.cutoffHz).toBe(7200)
  })
})
