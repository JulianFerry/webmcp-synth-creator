import { expect, test } from '@playwright/test'

test('invokes discovered get_patch when the browser omits the execution signal', async ({ page }) => {
  await page.addInitScript(() => {
    const registrations = new Map<string, ModelContextTool>()
    const modelContext = {
      async registerTool(tool: ModelContextTool) {
        registrations.set(tool.name, tool)
      },
      async getTools() {
        return [...registrations.values()].map(({ name }) => ({ name }))
      },
      async executeTool(tool: { name: string }, input = {}) {
        return JSON.stringify(
          await registrations.get(tool.name)!.execute(
            input,
            {} as ModelContextToolExecutionContext,
          ),
        )
      },
      ontoolchange: null,
    }

    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get: () => modelContext,
    })
  })

  await page.goto('/')

  const invocation = page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const getPatch = tools.find(({ name }) => name === 'get_patch')
    if (!getPatch) throw new Error('get_patch was not discovered')
    return document.modelContext!.executeTool(getPatch, {})
  })

  await expect(invocation).resolves.toContain('Ethereal Gate')
})
