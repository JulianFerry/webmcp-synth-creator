import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const artifactPresent = ['vital.mjs', 'vital.wasm'].every((filename) =>
  existsSync(resolve(process.cwd(), 'wasm/vital/build', filename)),
)

const FILTER_CUTOFF_MIN_HZ = 20
const FILTER_CUTOFF_MAX_HZ = 20_000

function cutoffControlValue(cutoffHz: number): string {
  const position =
    Math.log(cutoffHz / FILTER_CUTOFF_MIN_HZ) /
    Math.log(FILTER_CUTOFF_MAX_HZ / FILTER_CUTOFF_MIN_HZ)
  return String(
    FILTER_CUTOFF_MIN_HZ + position * (FILTER_CUTOFF_MAX_HZ - FILTER_CUTOFF_MIN_HZ),
  )
}

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

test.describe('default VitalWasmRenderer', () => {
  test.skip(!artifactPresent, 'Vital WASM artifact is not built')

  test('preserves audition, previews, WebMCP, history, and A/B contracts', async ({ page }) => {
    await installWebMcpDouble(page)
    await page.goto('/')
    await expect(page.getByTestId('webmcp-status')).toContainText('available')
    await expect(page.getByTestId('vital-status')).toContainText('ready')
    await expect(page.getByTestId('audio-lifecycle')).toHaveText('suspended')

    await expect(page.getByTestId('hold-note')).toHaveCount(0)
    await page.getByTestId('preview-note').click()
    await expect(page.getByTestId('audio-lifecycle')).toHaveText('running', { timeout: 30_000 })
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-active-count', '1')

    await page.getByRole('tab', { name: 'Effects' }).click()
    const cutoff = page.getByTestId('filter-cutoff-control')
    await cutoff.evaluate((element, value) => {
      const input = element as HTMLInputElement
      input.value = value
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, cutoffControlValue(2_400))
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
      'data-effective-cutoff',
      '2400',
    )
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '7200')
    await expect(page.getByTestId('history-size')).toHaveText('0')

    await cutoff.dispatchEvent('pointerup')
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '2400')
    await expect(page.getByTestId('history-size')).toHaveText('1')

    await page.evaluate(async () => {
      const tools = await document.modelContext!.getTools()
      const applyPatch = tools.find((tool) => tool.name === 'apply_patch')
      if (!applyPatch) throw new Error('apply_patch was not registered')
      await document.modelContext!.executeTool(applyPatch, {
        reason: 'Move oscillator one through the shared renderer boundary',
        changes: [{ path: 'oscillators.0.wavetablePosition', value: 0.25 }],
      })
    })
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.25')
    await expect(page.getByTestId('history-size')).toHaveText('2')

    await page.getByTestId('variant-b').click()
    await expect(page.getByTestId('current-variant')).toHaveText('B')
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
      'data-effective-spread',
      '1',
    )
    await page.getByTestId('variant-a').click()
    await expect(page.getByTestId('current-variant')).toHaveText('A')
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
      'data-effective-spread',
      '0.88',
    )
    await page.getByTestId('variant-b').click()
    await expect(page.getByTestId('current-variant')).toHaveText('B')

    await page.getByRole('button', { name: 'Undo transaction' }).click()
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
      'data-effective-spread',
      '0.88',
    )
    await page.getByRole('button', { name: 'Redo transaction' }).click()
    await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
      'data-effective-spread',
      '1',
    )
    await expect(page.getByTestId('audio-lifecycle')).toHaveText('running')
    await page.getByTestId('preview-stop').click()
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  })
})
