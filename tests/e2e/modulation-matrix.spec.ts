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
  await expect(page.getByTestId('amp-hold-handle')).toHaveCount(0)
  await expect(page.getByTestId('lfo-1-sync-division')).toBeVisible()
  await expect(page.getByTestId('lfo-1-phase')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-attack')).toHaveCount(0)
  await expect(page.getByTestId('modulation-route-count')).toHaveCount(0)

  const envelopeGraph = page.getByLabel('Editable ADSR amplitude envelope')
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

test('every LFO target shows a curve-aligned meter and visited trace during audition', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await executeTool(page, 'apply_patch', {
    reason: 'Configure visible level modulation feedback',
    changes: [
      { path: 'lfo1.enabled', value: true },
      { path: 'lfo1.target', value: 'pitch' },
      { path: 'lfo1.scope', value: 1 },
      { path: 'lfo1.rate', value: { mode: 'sync', division: '1/1' } },
      { path: 'lfo1.phase', value: 0.15 },
      { path: 'lfo2.enabled', value: true },
      { path: 'lfo2.target', value: 'cutoff' },
      { path: 'lfo2.scope', value: 'all' },
      { path: 'lfo2.points', value: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { path: 'lfo2.rate', value: { mode: 'sync', division: '1/8' } },
      { path: 'lfo2.phase', value: 0.35 },
    ],
  })

  const playhead = page.getByTestId('lfo-1-level-playhead')
  const secondPlayhead = page.getByTestId('lfo-2-level-playhead')
  await expect(playhead).toHaveCount(0)
  await expect(secondPlayhead).toHaveCount(0)
  await page.getByRole('group', { name: 'Oscillator 1 visualization' }).getByRole('button', { name: '2D' }).click()
  const waveform = page.getByTestId('oscillator-1-waveform').locator('.waveform-line')
  const stoppedPath = await waveform.getAttribute('d')

  await page.getByTestId('preview-note').click()
  await expect(playhead).toHaveCount(1)
  await expect(secondPlayhead).toHaveCount(1)
  const firstPhase = await playhead.getAttribute('data-phase')
  const firstTop = await playhead.getAttribute('y1')
  await expect.poll(() => playhead.getAttribute('data-phase')).not.toBe(firstPhase)
  await expect.poll(() => playhead.getAttribute('y1')).not.toBe(firstTop)
  const secondTop = await secondPlayhead.getAttribute('y1')
  await expect.poll(() => secondPlayhead.getAttribute('y1')).not.toBe(secondTop)
  const trace = page.getByTestId('lfo-1-visited-trace')
  await expect(trace).toBeVisible()
  await expect(trace).toHaveAttribute('data-start-phase', '0.1500')
  const firstProgress = Number(await trace.getAttribute('data-progress'))
  await expect.poll(async () => Number(await trace.getAttribute('data-progress'))).toBeGreaterThan(firstProgress)
  await expect(trace).toHaveAttribute('data-start-phase', '0.0000', { timeout: 3_000 })
  await expect(waveform).toHaveAttribute('d', stoppedPath!)

  await executeTool(page, 'apply_patch', {
    reason: 'Verify the sweep remains visible for a level target',
    changes: [{ path: 'lfo1.target', value: 'level' }],
  })
  await expect(playhead).toHaveCount(1)
  const levelPhase = await playhead.getAttribute('data-phase')
  await expect.poll(() => playhead.getAttribute('data-phase')).not.toBe(levelPhase)

  await page.getByTestId('preview-stop').click()
  await expect(playhead).toHaveCount(0)
  await expect(secondPlayhead).toHaveCount(0)
  await expect(page.getByTestId('lfo-1-visited-trace')).toHaveCount(0)
  await expect(page.getByTestId('lfo-2-visited-trace')).toHaveCount(0)
})

test('LFO 2 all-scope feedback animates enabled oscillators but not disabled cards', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  const patch = await executeTool<{ oscillators: Array<{ wavetableId: string }> }>(page, 'get_patch', {})
  await executeTool(page, 'apply_patch', {
    reason: 'Configure visible position modulation feedback',
    changes: [
      { path: 'oscillators.1.enabled', value: false },
      { path: 'oscillators.2.enabled', value: false },
      { path: 'oscillators.0.wavetablePosition', value: 0.5 },
      { path: 'oscillators.1.wavetableId', value: patch.oscillators[0].wavetableId },
      { path: 'oscillators.1.wavetablePosition', value: 0.5 },
      { path: 'oscillators.2.wavetableId', value: patch.oscillators[0].wavetableId },
      { path: 'oscillators.2.wavetablePosition', value: 0.5 },
      { path: 'lfo1.enabled', value: false },
      { path: 'lfo2.enabled', value: true },
      { path: 'lfo2.target', value: 'position' },
      { path: 'lfo2.scope', value: 'all' },
      { path: 'lfo2.depth', value: 0.4 },
      { path: 'lfo2.points', value: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { path: 'lfo2.rate', value: { mode: 'sync', division: '1/8' } },
    ],
  })

  const displays = [1, 2, 3].map((number) => page.locator(`[data-testid="oscillator-${number}-editor"] .wavetable-display`))
  const stoppedPositions = await Promise.all(displays.map((display) => display.getAttribute('data-position')))
  await page.getByTestId('preview-note').click()
  const lfo2Playhead = page.getByTestId('lfo-2-level-playhead')
  await expect(lfo2Playhead).toHaveCount(1)
  const lfo2Phase = await lfo2Playhead.getAttribute('data-phase')
  await expect.poll(() => lfo2Playhead.getAttribute('data-phase')).not.toBe(lfo2Phase)
  await expect.poll(() => displays[0].getAttribute('data-position')).not.toBe(stoppedPositions[0])
  await expect.poll(() => page.getByTestId('oscillator-1-waterfall').getAttribute('data-position')).not.toBe(stoppedPositions[0])
  for (const [index, display] of displays.slice(1).entries()) {
    await expect(display).toHaveAttribute('data-position', stoppedPositions[index + 1]!)
    await expect.poll(async () => Number(await page.getByTestId(`oscillator-${index + 2}-waterfall`).getAttribute('data-position'))).toBe(Number(stoppedPositions[index + 1]))
  }

  await page.getByRole('group', { name: 'Oscillator 1 visualization' }).getByRole('button', { name: '2D' }).click()
  const waveformPath = page.getByTestId('oscillator-1-waveform').locator('.waveform-line')
  const firstPath = await waveformPath.getAttribute('d')
  await expect.poll(() => waveformPath.getAttribute('d')).not.toBe(firstPath)
  await page.getByTestId('preview-stop').click()
  for (const [index, display] of displays.entries()) {
    await expect(display).toHaveAttribute('data-position', stoppedPositions[index]!)
  }
})
