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

test('WebMCP adds an oscillator 3 route to a held Vital note and undo removes it', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  const before = await executeTool<{
    modulations: Array<{
      id: string
      source: 'lfo1' | 'modEnvelope'
      destination: string
      amount: number
      bipolar: boolean
    }>
  }>(page, 'get_patch', {})
  const audioState = page.getByTestId('audio-adapter-state')
  const version = Number(await audioState.getAttribute('data-modulation-version'))
  const nextModulations = [
    ...before.modulations,
    {
      id: 'phase5-oscillator-3-position',
      source: 'modEnvelope' as const,
      destination: 'oscillator3.wavetablePosition',
      amount: 0.35,
      bipolar: false,
    },
  ]

  const result = await executeTool<{ summary: { modulations: unknown[] } }>(page, 'apply_patch', {
    reason: 'Route the modulation envelope to oscillator 3 through the Vital renderer',
    changes: [{ path: 'modulations', value: nextModulations }],
  })

  expect(result.summary.modulations).toHaveLength(nextModulations.length)
  await expect(audioState).toHaveAttribute('data-route-count', String(nextModulations.length))
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version + 1))
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  await executeTool(page, 'undo', {})
  await expect(audioState).toHaveAttribute('data-route-count', String(before.modulations.length))
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version + 2))
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
})

test('direct amp and LFO editors stay mounted while removed routing controls remain WebMCP-only', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await page.getByTestId('preview-note').click()

  await expect(page.getByTestId('amp-hold')).toBeVisible()
  await expect(page.getByTestId('lfo-sync-division')).toBeVisible()
  await expect(page.getByTestId('lfo-phase')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-attack')).toHaveCount(0)
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)

  const envelopeGraph = page.getByLabel('Editable AHDSR amplitude envelope')
  const lfoGraph = page.getByLabel(/Editable LFO shape/)
  const envelopeBox = await envelopeGraph.boundingBox()
  const lfoBox = await lfoGraph.boundingBox()
  expect(envelopeBox).not.toBeNull()
  expect(lfoBox).not.toBeNull()
  expect(Math.abs(envelopeBox!.height - lfoBox!.height)).toBeLessThan(3)

  const audioState = page.getByTestId('audio-adapter-state')
  const version = Number(await audioState.getAttribute('data-modulation-version'))
  const changed = await executeTool<{ summary: { modEnvelope: { attackSeconds: number } } }>(
    page,
    'apply_patch',
    {
      reason: 'Edit the retained modulation envelope through the logical WebMCP contract',
      changes: [{ path: 'modEnvelope.attackSeconds', value: 0.33 }],
    },
  )
  expect(changed.summary.modEnvelope.attackSeconds).toBe(0.33)
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version + 1))

  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('effects-grid')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-attack')).toHaveCount(0)
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)
  await expect(page.getByTestId('voice-polyphony')).toHaveCount(0)
  await expect(page.getByTestId('voice-glide')).toHaveCount(0)
})
