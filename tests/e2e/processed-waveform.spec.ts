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

test('variant A spectral preview follows canonical WebMCP edits', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  const preview = page.getByTestId('variant-a-spectrogram')
  const beforeSignature = await preview.getAttribute('data-spectral-signature')

  await page.evaluate(async () => {
    const tool = (await document.modelContext!.getTools()).find((candidate) => candidate.name === 'apply_patch')
    if (!tool) throw new Error('apply_patch was not registered')
    for (const value of [900, 1_800, 6_500]) {
      await document.modelContext!.executeTool(tool, {
        reason: 'Sweep preview cutoff',
        changes: [{ path: 'filter.cutoffHz', value }],
      })
    }
  })

  await expect(preview).not.toHaveAttribute('data-spectral-signature', beforeSignature ?? '')
  await expect(preview).toHaveAttribute('data-spectral-signature', /"cutoff":6500/)
})
