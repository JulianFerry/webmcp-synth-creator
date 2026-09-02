import { expect, test, type Page } from '@playwright/test'

async function installWebMcpDouble(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Tool = {
      name: string
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
        return [...tools.values()].map(({ name }) => ({ name }))
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
      const tool = (await document.modelContext!.getTools()).find(
        (candidate) => candidate.name === toolName,
      )
      if (!tool) throw new Error(`${toolName} was not registered`)
      return JSON.parse(await document.modelContext!.executeTool(tool, toolInput)) as T
    },
    { toolName: name, toolInput: input },
  )
}

test('WebMCP cannot add selective oscillator routes outside the visible LFO controls', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  const before = await executeTool<Record<string, unknown>>(page, 'get_patch', {})
  expect(before).not.toHaveProperty('modulations')
  const audioState = page.getByTestId('audio-adapter-state')
  const version = Number(await audioState.getAttribute('data-modulation-version'))

  const result = await executeTool<{
    ok: false
    error: { code: string; message: string }
  }>(page, 'apply_patch', {
    reason: 'Route the modulation envelope to oscillator 3 through the Vital renderer',
    changes: [{ path: 'modulations', value: [] }],
  })

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'INVALID_APPLY_PATCH_INPUT',
      message:
        'Modulation routing is not agent-editable. Use the same LFO enable, shape, rate, phase, and smoothing controls exposed by the Workbench UI.',
    },
  })
  await expect(audioState).toHaveAttribute('data-route-count', '6')
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version))
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
})

test('direct amp and LFO editors stay mounted while routing controls remain hidden', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await page.getByTestId('preview-note').click()

  await expect(page.getByTestId('amp-hold')).toHaveCount(0)
  await expect(page.getByTestId('amp-hold-handle')).toBeVisible()
  await expect(page.getByTestId('lfo-1-sync-division')).toBeVisible()
  await expect(page.getByTestId('lfo-1-phase')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-attack')).toHaveCount(0)
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)

  const envelopeGraph = page.getByLabel('Editable AHDSR amplitude envelope')
  const lfoGraph = page.getByLabel(/Editable LFO shape/).first()
  const envelopeBox = await envelopeGraph.boundingBox()
  const lfoBox = await lfoGraph.boundingBox()
  expect(envelopeBox).not.toBeNull()
  expect(lfoBox).not.toBeNull()
  expect(envelopeBox!.height).toBeGreaterThanOrEqual(80)
  expect(lfoBox!.height).toBeGreaterThanOrEqual(80)

  const audioState = page.getByTestId('audio-adapter-state')
  const version = Number(await audioState.getAttribute('data-modulation-version'))
  const changed = await executeTool<{ current: { mod_env: { attackSeconds: number } } }>(
    page,
    'apply_patch',
    {
      reason: 'Edit the retained modulation envelope through the logical WebMCP contract',
      changes: [{ path: 'modEnvelope.attackSeconds', value: 0.33 }],
    },
  )
  expect(changed.current.mod_env.attackSeconds).toBe(0.33)
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version + 1))

  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('effects-grid')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-attack')).toHaveCount(0)
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)
  await expect(page.getByTestId('voice-polyphony')).toHaveCount(0)
  await expect(page.getByTestId('voice-glide')).toHaveCount(0)
})
