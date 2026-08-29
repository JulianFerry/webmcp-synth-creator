import { expect, test, type Page } from '@playwright/test'

async function installWebMcpDouble(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Tool = { name: string; execute: (input: Record<string, unknown>, context: { signal: AbortSignal }) => Promise<unknown> }
    const tools = new Map<string, Tool>()
    const context = {
      async registerTool(tool: Tool, options: { signal?: AbortSignal } = {}) {
        tools.set(tool.name, tool)
        options.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
      async getTools() { return [...tools.values()].map(({ name }) => ({ name })) },
      async executeTool(tool: { name: string }, input: Record<string, unknown> = {}) {
        const definition = tools.get(tool.name)
        if (!definition) throw new Error(`Unknown tool: ${tool.name}`)
        return JSON.stringify(await definition.execute(input, { signal: new AbortController().signal }))
      },
      ontoolchange: null,
    }
    Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get: () => context })
  })
}

test('workbench tabs expose keyboard navigation and mount only the active panel', async ({ page }) => {
  await page.goto('/')
  const tablist = page.getByRole('tablist', { name: 'Workbench sections' })
  const overview = tablist.getByRole('tab', { name: /Overview/ })
  const oscillators = tablist.getByRole('tab', { name: /Oscillators/ })
  const modulation = tablist.getByRole('tab', { name: /Modulation & FX/ })

  await expect(tablist).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await expect(overview).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('keyboard-surface')).toBeVisible()

  await overview.focus()
  await overview.press('ArrowRight')
  await expect(oscillators).toBeFocused()
  await expect(oscillators).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('keyboard-surface')).toHaveCount(0)
  await expect(page.getByTestId('oscillator-3-level')).toBeVisible()

  await oscillators.press('End')
  await expect(modulation).toBeFocused()
  await expect(page.getByTestId('filter-cutoff-control')).toBeVisible()
  await expect(page.getByTestId('oscillator-1-level')).toHaveCount(0)

  await modulation.press('Home')
  await expect(overview).toBeFocused()
  await page.keyboard.down('a')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.keyboard.up('a')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
})

test('WebMCP changes update the global indicator without changing tabs or history on navigation', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  const beforeHistory = await page.getByTestId('history-size').textContent()
  await page.evaluate(async () => {
    const tool = (await document.modelContext!.getTools()).find((candidate) => candidate.name === 'apply_patch')
    if (!tool) throw new Error('apply_patch was not registered')
    await document.modelContext!.executeTool(tool, { reason: 'Lower filter cutoff', changes: [{ path: 'filter.cutoffHz', value: 4100 }] })
  })
  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('last-change-indicator')).toContainText('LLM changed')
  await expect(page.getByTestId('last-change-indicator')).toContainText('Lower filter cutoff')
  await page.getByRole('button', { name: 'Jump to Modulation & FX' }).click()
  await expect(page.getByRole('tab', { name: /Modulation & FX/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('history-size')).toHaveText(String(Number(beforeHistory) + 1))
})
