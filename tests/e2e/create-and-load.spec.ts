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

const customSinePatch = {
  version: 1,
  metadata: {
    name: 'Agent Sine Sketch',
    category: 'keys',
    description: 'A complete structured patch created through the injected WebMCP client.',
    tags: ['clean', 'agent'],
  },
  oscillators: [
    {
      enabled: true,
      wavetableId: 'sine',
      wavetablePosition: 0,
      level: 0.62,
      transposeSemitones: 0,
      fineTuneCents: 0,
      unisonVoices: 1,
      unisonDetune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    },
    {
      enabled: true,
      wavetableId: 'sine',
      wavetablePosition: 0,
      level: 0.18,
      transposeSemitones: 12,
      fineTuneCents: 0,
      unisonVoices: 1,
      unisonDetune: 0,
      stereoSpread: 0,
      randomPhase: 0,
    },
  ],
  ampEnvelope: {
    attackSeconds: 0.01,
    holdSeconds: 0,
    decaySeconds: 0.4,
    sustainLevel: 0.7,
    releaseSeconds: 0.35,
  },
  modEnvelope: {
    attackSeconds: 0.01,
    holdSeconds: 0,
    decaySeconds: 0.5,
    sustainLevel: 0,
    releaseSeconds: 0.2,
  },
  filter: { enabled: true, type: 'lowpass', cutoffHz: 4800, resonance: 0.12 },
  lfo1: {
    enabled: false,
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
    rate: { mode: 'sync', division: '1/4' },
    phase: 0,
    smooth: true,
  },
  modulations: [],
  voice: { polyphony: 6, legato: false, glideSeconds: 0, velocitySensitivity: 0.4 },
  effects: {
    delay: {
      enabled: false,
      mode: 'sync',
      division: '1/8',
      timeSeconds: 0.25,
      feedback: 0.2,
      mix: 0,
    },
    reverb: { enabled: true, mix: 0.16, decaySeconds: 1.8, size: 0.42 },
  },
  wavetableData: {
    sine: { id: 'sine', name: 'Agent Sine', frames: [{ harmonics: [1] }] },
  },
}

const curatedStarts = [
  ['midnight-pad', 'Midnight Pad'],
  ['warm-mono-bass', 'Warm Mono Bass'],
  ['glass-pluck', 'Glass Pluck'],
  ['wide-lead', 'Wide Lead'],
  ['rhythmic-pulse', 'Rhythmic Pulse'],
  ['ethereal-gate', 'Ethereal Gate'],
] as const

test('create and load complete patches through WebMCP and curated UI paths', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const presets = await executeTool<Array<{ id: string; name: string }>>(page, 'list_presets', {})
  expect(presets).toHaveLength(6)
  expect(presets.map(({ id }) => id).sort()).toEqual(
    curatedStarts.map(([id]) => id).sort(),
  )

  await page.getByTestId('hold-note').click()
  const created = await executeTool<{
    changed: Record<string, unknown>
    summary: { name: string }
    session: { currentVariant: string; canUndo: boolean }
  }>(page, 'create_patch', {
    reason: 'Create one complete playable sine patch',
    patch: customSinePatch,
  })
  expect(created.summary.name).toBe('Agent Sine Sketch')
  expect(created.session).toMatchObject({ currentVariant: 'A', canUndo: true })
  expect(created.changed).toHaveProperty('wavetableData')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agent Sine Sketch')
  await expect(page.getByTestId('preset-selector')).toHaveValue('')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-held', 'true')
  await expect(page.getByTestId('latest-diff')).toContainText('wavetableData')

  await executeTool(page, 'undo', {})
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethereal Gate')
  await expect(page.getByTestId('preset-selector')).toHaveValue('ethereal-gate')

  for (const [presetId, name] of curatedStarts) {
    await page.getByTestId('preset-selector').selectOption(presetId)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-held', 'true')
    await expect(page.getByTestId('export-filename')).toContainText(`${presetId}.vital`)
  }

  for (const [presetId, name] of curatedStarts) {
    const loaded = await executeTool<{ summary: { name: string }; changed: Record<string, unknown> }>(
      page,
      'load_preset',
      { presetId },
    )
    expect(loaded.summary.name).toBe(name)
    expect(Object.keys(loaded.changed).length).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByTestId('preset-selector')).toHaveValue(presetId)
  }

  await executeTool(page, 'apply_patch', {
    reason: 'Darken the loaded patch in one conservative edit',
    changes: [{ path: 'filter.cutoffHz', value: 5000 }],
  })
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '5000')
  const undone = await executeTool<{ summary: { filter: { cutoffHz: number } } }>(page, 'undo', {})
  expect(undone.summary.filter.cutoffHz).toBe(7200)

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
