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

test('A/B session creates and auditions wider B, undoes only B, then exports selected A', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await expect(page.getByTestId('vital-status')).toContainText('ready')
  await page.getByTestId('hold-note').click()

  const creation = await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const tool = tools.find((candidate) => candidate.name === 'create_variant')
    if (!tool) throw new Error('create_variant was not registered')
    return JSON.parse(
      await document.modelContext!.executeTool(tool, {
        reason: 'Create a wider B while preserving the current tone',
        changes: [
          { path: 'metadata.name', value: 'Ethereal Gate Wide B' },
          { path: 'oscillators.0.unisonVoices', value: 7 },
          { path: 'oscillators.0.stereoSpread', value: 1 },
        ],
      }),
    ) as {
      session: { currentVariant: string; hasVariantB: boolean }
      changed: Record<string, unknown>
    }
  })

  expect(creation.session).toMatchObject({ currentVariant: 'B', hasVariantB: true })
  expect(Object.keys(creation.changed)).toEqual([
    'metadata.name',
    'oscillators.0.unisonVoices',
    'oscillators.0.stereoSpread',
  ])
  await expect(page.getByTestId('variant-b')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethereal Gate Wide B')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-variant', 'B')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-spread', '1')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-unison', '7')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-held', 'true')
  await expect(page.getByTestId('history-size')).toHaveText('1')

  await page.getByTestId('variant-a').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethereal Gate')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-variant', 'A')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-spread', '0.88')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-unison', '5')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-held', 'true')
  await expect(page.getByTestId('history-size')).toHaveText('0')

  await page.getByTestId('variant-b').click()
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-spread', '1')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethereal Gate')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-variant', 'B')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-spread', '0.88')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  await expect(page.getByTestId('future-size')).toHaveText('1')
  await expect(page.getByTestId('redo-available')).toHaveText('available')

  await page.getByTestId('variant-a').click()
  await expect(page.getByTestId('current-variant')).toHaveText('A')
  await expect(page.getByTestId('future-size')).toHaveText('0')
  await expect(page.getByTestId('export-filename')).toHaveText('ethereal-gate.vital')

  const sessionState = await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const tool = tools.find((candidate) => candidate.name === 'get_session_state')
    if (!tool) throw new Error('get_session_state was not registered')
    return JSON.parse(await document.modelContext!.executeTool(tool, {})) as {
      currentVariant: string
      hasVariantB: boolean
      canUndo: boolean
      canRedo: boolean
    }
  })
  expect(sessionState).toMatchObject({
    currentVariant: 'A',
    hasVariantB: true,
    canUndo: false,
    canRedo: false,
  })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('ethereal-gate.vital')
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    preset_name: string
    settings: { osc_1_unison_voices: number; osc_1_stereo_spread: number }
  }
  expect(exported.preset_name).toBe('Ethereal Gate')
  expect(exported.settings).toMatchObject({
    osc_1_unison_voices: 5,
    osc_1_stereo_spread: 0.88,
  })
})
