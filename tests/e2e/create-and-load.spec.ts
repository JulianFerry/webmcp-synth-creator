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

async function executeTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tools = await document.modelContext!.getTools()
      const tool = tools.find((candidate) => candidate.name === toolName)
      if (!tool) throw new Error(`${toolName} was not registered`)
      return JSON.parse(await document.modelContext!.executeTool(tool, toolInput)) as T
    },
    { toolName: name, toolInput: input },
  )
}

const curatedStarts = [
  ['midnight-pad', 'Midnight Pad'],
  ['warm-mono-bass', 'Warm Mono Bass'],
  ['glass-pluck', 'Glass Pluck'],
  ['wide-lead', 'Wide Lead'],
  ['rhythmic-pulse', 'Rhythmic Pulse'],
  ['ethereal-gate', 'Ethereal Gate'],
] as const

const calibrationStarts = [
  ['calibration-a-osc1-sine', 'Calibration A — OSC1 Sine'],
  ['calibration-b-custom-wavetable', 'Calibration B — Custom Wavetable'],
  ['calibration-c-amp-envelope', 'Calibration C — Amp Envelope'],
  ['calibration-d-unison', 'Calibration D — Unison'],
  ['calibration-e-filter', 'Calibration E — Filter'],
  ['calibration-f-lfo-gate', 'Calibration F — LFO Gate'],
  ['calibration-g-osc2', 'Calibration G — OSC2'],
  ['calibration-h-delay-reverb', 'Calibration H — Delay + Reverb'],
] as const

const allStarts = [...calibrationStarts, ...curatedStarts] as const

test('create and load complete patches through WebMCP and curated UI paths', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const presets = await executeTool<Array<{ id: string; name: string }>>(page, 'list_presets', {})
  expect(presets).toHaveLength(14)
  expect(presets.map(({ id }) => id).sort()).toEqual(
    allStarts.map(([id]) => id).sort(),
  )

  await page.getByTestId('preview-note').click()
  const created = await executeTool<{
    changed: Record<string, unknown>
    current: { metadata: { name: string; description: string } }
    session: { currentVariant: string; canUndo: boolean }
  }>(page, 'create_patch', {
    description: 'Create one complete playable lead patch',
    attributes: { category: 'lead' },
    singleProposal: true,
  })
  expect(created.current.metadata).toMatchObject({
    name: 'Create one complete playable lead patch',
    description: 'Create one complete playable lead patch',
  })
  expect(created.session).toMatchObject({ currentVariant: 'A', canUndo: true })
  expect(created.changed['metadata.description']).toBeDefined()
  await expect(page.locator('.patch-actions')).toHaveAttribute(
    'data-patch-name',
    'Create one complete playable lead patch',
  )
  await expect(page.getByTestId('preset-selector')).toHaveValue('')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByTestId('latest-diff')).toContainText('wavetableData')

  await executeTool(page, 'undo', {})
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Ethereal Gate')
  await expect(page.getByTestId('preset-selector')).toHaveValue('ethereal-gate')

  for (const [presetId, name] of allStarts) {
    await page.getByTestId('preset-selector').selectOption(presetId)
    await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', name)
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await expect(page.getByTestId('export-filename')).toContainText(`${presetId}.vital`)
  }

  for (const [presetId, name] of allStarts) {
    const loaded = await executeTool<{ current: { metadata: { name: string } }; changed: Record<string, unknown> }>(
      page,
      'load_preset',
      { presetId },
    )
    expect(loaded.current.metadata.name).toBe(name)
    expect(Object.keys(loaded.changed).length).toBeGreaterThan(0)
    await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', name)
    await expect(page.getByTestId('preset-selector')).toHaveValue(presetId)
  }

  await executeTool(page, 'apply_patch', {
    reason: 'Darken the loaded patch in one conservative edit',
    changes: [{ path: 'filter.cutoffHz', value: 5000 }],
  })
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '5000')
  const undone = await executeTool<{ current: { filter: { cutoffHz: number } } }>(page, 'undo', {})
  expect(undone.current.filter.cutoffHz).toBe(7200)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('ethereal-gate.vital')
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    preset_name: string
    settings: { wavetables: unknown[]; lfos: unknown[]; modulations: unknown[] }
  }
  expect(exported.preset_name).toBe('Ethereal Gate')
  expect(exported.settings.wavetables).toHaveLength(3)
  expect(exported.settings.lfos.length).toBeGreaterThan(0)
  expect(exported.settings.modulations.length).toBeGreaterThan(0)
})
