import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

async function installWebMcpDouble(page: Page): Promise<void> {
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
        return JSON.stringify(
          await definition.execute(input, { signal: new AbortController().signal }),
        )
      },
      ontoolchange: null,
    }

    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get: () => context,
    })
  })
}

test('LFO edit updates one transaction, SVG, audio scheduling, and Vital structure', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  const shape = page.getByTestId('lfo-shape-path')
  const initialShape = await shape.getAttribute('d')
  const adapter = page.getByTestId('audio-adapter-state')
  const initialScheduleVersion = Number(
    await adapter.getAttribute('data-modulation-version'),
  )
  const points = [
    { x: 0, y: 0 },
    { x: 0.02, y: 1 },
    { x: 0.2, y: 0 },
    { x: 0.27, y: 0.9 },
    { x: 0.35, y: 0 },
    { x: 0.52, y: 1 },
    { x: 0.7, y: 0 },
    { x: 0.78, y: 0.76 },
    { x: 0.94, y: 0 },
    { x: 1, y: 0 },
  ]

  const rawResult = await page.evaluate(async (nextPoints) => {
    const tools = await document.modelContext!.getTools()
    const tool = tools.find((candidate) => candidate.name === 'set_lfo_shape')
    if (!tool) throw new Error('set_lfo_shape was not registered')
    return document.modelContext!.executeTool(tool, {
      reason: 'Shorten the second pulse and preserve the gate rate and routes',
      points: nextPoints,
    })
  }, points)
  const result = JSON.parse(rawResult) as {
    changed: Record<string, { before: unknown; after: unknown }>
    summary: { lfo1: { rate: unknown }; modulations: unknown[] }
  }

  expect(Object.keys(result.changed)).toEqual(['lfo1.points'])
  expect(result.summary.lfo1.rate).toEqual({ mode: 'sync', division: '1/8' })
  expect(result.summary.modulations).toHaveLength(2)
  expect(await shape.getAttribute('d')).not.toBe(initialShape)
  await expect(page.getByTestId('lfo-point-count')).toHaveText('10 points')
  await expect(page.getByTestId('lfo-rate-readout')).toHaveText('1/8')
  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)
  await expect(page.getByTestId('effects-grid')).toBeVisible()
  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await expect(page.getByTestId('latest-diff')).toContainText('lfo1.points')
  await expect(adapter).toHaveAttribute(
    'data-modulation-version',
    String(initialScheduleVersion + 1),
  )

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    settings: {
      lfo_1_sync: number
      lfo_1_tempo: number
      lfos: Array<{ points: number[] }>
      modulations: Array<{ source: string; destination: string }>
    }
  }
  expect(exported.settings.lfos[0].points).toEqual(
    points.flatMap((point) => [point.x, 1 - point.y]),
  )
  expect(exported.settings).toMatchObject({ lfo_1_sync: 1, lfo_1_tempo: 9 })
  expect(exported.settings.modulations.slice(0, 2)).toEqual([
    { source: 'lfo_1', destination: 'osc_1_level' },
    { source: 'lfo_1', destination: 'filter_fx_cutoff' },
  ])
})

test('LFO edit heading toggle and shape mode remain independent and preserve configuration', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await page.getByTestId('preview-note').click()
  const adapter = page.getByTestId('audio-adapter-state')
  const initialScheduleVersion = Number(
    await adapter.getAttribute('data-modulation-version'),
  )

  const readPatch = () =>
    page.evaluate(async () => {
      const tools = await document.modelContext!.getTools()
      const tool = tools.find((candidate) => candidate.name === 'get_patch')
      if (!tool) throw new Error('get_patch was not registered')
      return JSON.parse(await document.modelContext!.executeTool(tool, {})) as {
        lfo1: { enabled: boolean; points: unknown[]; rate: unknown; phase: number; smooth: boolean }
        modulations: unknown[]
        effects: { delay: { division?: string } }
      }
    })

  const before = await readPatch()
  const panel = page.locator('.lfo-panel')
  const heading = panel.locator('.panel-heading')
  const enableToggle = heading.getByRole('switch', { name: 'LFO' })
  const shapeMode = panel.getByRole('combobox', { name: 'Shape mode' })

  await expect(enableToggle).toHaveAttribute('aria-checked', 'true')
  await expect(shapeMode).toHaveValue(before.lfo1.smooth ? 'smooth' : 'precise')
  await enableToggle.press('Space')

  await expect(enableToggle).toHaveAttribute('aria-checked', 'false')
  await expect(panel).toHaveClass(/is-disabled/)
  await expect(panel.locator('.lfo-plot')).toHaveCSS('opacity', '0.34')
  await expect(shapeMode).toHaveValue(before.lfo1.smooth ? 'smooth' : 'precise')
  await expect(adapter).toHaveAttribute('data-lfo-enabled', 'false')
  await expect(adapter).toHaveAttribute(
    'data-modulation-version',
    String(initialScheduleVersion + 1),
  )
  await expect(page.getByTestId('latest-diff')).toContainText('lfo1.enabled')
  const disabled = await readPatch()
  expect(disabled.lfo1).toEqual({ ...before.lfo1, enabled: false })
  expect(disabled.modulations).toEqual(before.modulations)

  await shapeMode.selectOption('smooth')
  await expect(enableToggle).toHaveAttribute('aria-checked', 'false')
  await expect(shapeMode).toHaveValue('smooth')
  const smooth = await readPatch()
  expect(smooth.lfo1).toEqual({ ...before.lfo1, enabled: false, smooth: true })
  expect(smooth.modulations).toEqual(before.modulations)
  await expect(page.getByTestId('latest-diff')).toContainText('lfo1.smooth')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    settings: Record<string, unknown>
  }
  expect(exported.settings).toMatchObject({
    modulation_1_amount: 0.56,
    modulation_1_bypass: 1,
    modulation_2_amount: 0.12,
    modulation_2_bypass: 1,
  })

  await enableToggle.press('Enter')
  await expect(panel).not.toHaveClass(/is-disabled/)
  const reenabled = await readPatch()
  expect(reenabled.lfo1).toEqual({ ...before.lfo1, smooth: true })
  expect(reenabled.modulations).toEqual(before.modulations)
})

test('LFO edit delay exposes all mapped divisions', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  const readDelayDivision = () =>
    page.evaluate(async () => {
      const tools = await document.modelContext!.getTools()
      const tool = tools.find((candidate) => candidate.name === 'get_patch')
      if (!tool) throw new Error('get_patch was not registered')
      const patch = JSON.parse(await document.modelContext!.executeTool(tool, {})) as {
        effects: { delay: { division?: string } }
      }
      return patch.effects.delay.division
    })

  const delayDivision = page.getByTestId('delay-division')
  expect(await delayDivision.locator('option').allTextContents()).toEqual([
    '1/1',
    '1/2',
    '1/4',
    '1/8',
    '1/8 triplet',
    '1/16',
    '1/16 triplet',
    '1/32',
    '1/64',
  ])
  await delayDivision.selectOption('1/64')
  expect(await readDelayDivision()).toBe('1/64')
})
