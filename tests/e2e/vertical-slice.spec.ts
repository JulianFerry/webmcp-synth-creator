import { expect, test } from '@playwright/test'

test('vertical slice commits a WebMCP edit to UI, audio, history, trace, and Vital export', async ({
  page,
}) => {
  await page.addInitScript(() => {
    type Tool = {
      name: string
      description: string
      inputSchema: Record<string, unknown>
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
      execute: (
        input: Record<string, unknown>,
        context: { signal: AbortSignal },
      ) => Promise<unknown>
    }

    const tools = new Map<string, Tool>()
    const context = {
      async registerTool(tool: Tool, options: { signal?: AbortSignal } = {}) {
        await Promise.resolve()
        tools.set(tool.name, tool)
        options.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
      async getTools() {
        return [...tools.values()].map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        }))
      },
      async executeTool(tool: { name: string }, input: Record<string, unknown> = {}) {
        const definition = tools.get(tool.name)
        if (!definition) throw new Error(`Unknown tool: ${tool.name}`)
        const controller = new AbortController()
        return JSON.stringify(await definition.execute(input, { signal: controller.signal }))
      },
      ontoolchange: null,
    }

    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get: () => context,
    })
  })

  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const toolNames = await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    return tools.map((tool) => tool.name)
  })
  expect(toolNames).toEqual([
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

  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  const rawResult = await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const applyPatch = tools.find((tool) => tool.name === 'apply_patch')
    if (!applyPatch) throw new Error('apply_patch was not registered')
    return document.modelContext!.executeTool(applyPatch, {
      reason: 'Darken and rename the held patch in one coherent transaction',
      changes: [
        { path: 'metadata.name', value: 'Airy Night' },
        { op: 'tone', brightness: 0.5, keep_air: true },
        { path: 'oscillators.0.wavetablePosition', value: 0.25 },
      ],
    })
  })
  const result = JSON.parse(rawResult) as {
    canUndo: boolean
    changed: Record<string, { before: unknown; after: unknown }>
    current: { filter: { cutoffHz: number } }
    undo_step: number
    correlationId: string
  }

  expect(result.canUndo).toBe(true)
  expect(result.changed['filter.cutoffHz']).toEqual({
    before: 7200,
    after: result.current.filter.cutoffHz,
  })
  expect(result.undo_step).toBe(1)
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Airy Night')
  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('filter-cutoff')).toContainText(
    result.current.filter.cutoffHz.toLocaleString(),
  )
  await expect(page.getByTestId('latest-diff')).toContainText('oscillators.0.wavetablePosition')
  await expect(page.getByTestId('undo-available')).toHaveText('available')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-cutoff',
    String(result.current.filter.cutoffHz),
  )
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.25')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByTestId('export-filename')).toHaveText('airy-night.vital')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('airy-night.vital')

  // The latency trace is installed behind import.meta.env.DEV, so the global is
  // absent from a production bundle and these stages are unobservable there.
  if (process.env.PLAYWRIGHT_PREVIEW !== '1') {
    const correlatedStages = await page.evaluate((correlationId) => {
      return (
        window.__WEBMCP_SYNTH_CREATOR_TRACE__?.getEvents()
          .filter((event) => event.correlationId === correlationId)
          .map((event) => event.stage) ?? []
      )
    }, result.correlationId)
    expect(correlatedStages).toEqual([
      'request_received',
      'patch_committed',
      'audio_diff_applied',
    ])
  }
})
