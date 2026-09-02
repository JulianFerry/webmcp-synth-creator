import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { encodeVitalEffectOrder } from '../../src/vital/effectOrder'

const DISTORTION_LAST_ORDER = [
  'filter',
  'compressor',
  'chorus',
  'delay',
  'reverb',
  'distortion',
] as const

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

async function setRange(page: Page, testId: string, value: number): Promise<void> {
  const control = page.getByTestId(testId)
  await control.focus()
  await control.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement
    input.value = String(nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await control.blur()
  await expect(control).toHaveAttribute('data-parameter-value', String(value))
}

async function expectParameter(page: Page, testId: string, value: number): Promise<void> {
  await expect.poll(async () => Number(await page.getByTestId(testId).getAttribute('data-parameter-value'))).toBeCloseTo(value)
}

test('workbench tabs expose keyboard navigation and mount only the active panel', async ({ page }) => {
  await page.goto('/')
  const tablist = page.getByRole('tablist', { name: 'Workbench sections' })
  const oscillators = tablist.getByRole('tab', { name: /Oscillators/ })
  const modulation = tablist.getByRole('tab', { name: 'Effects' })

  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await expect(oscillators).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('keyboard-surface')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Variant comparison' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Amplitude envelope' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'LFO 1', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'LFO 2', exact: true })).toBeVisible()

  const envelopeTypeBounds = await page.locator('.envelope-type-chip').boundingBox()
  const lfoToggleBounds = await page.getByRole('switch', { name: 'LFO 1' }).boundingBox()
  expect(envelopeTypeBounds).not.toBeNull()
  expect(lfoToggleBounds).not.toBeNull()
  expect(envelopeTypeBounds!.width).toBe(lfoToggleBounds!.width)
  expect(envelopeTypeBounds!.height).toBe(lfoToggleBounds!.height)

  await oscillators.focus()
  await oscillators.press('ArrowRight')
  await expect(modulation).toBeFocused()
  await expect(modulation).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('keyboard-surface')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Variant comparison' })).toBeVisible()
  await modulation.press('Home')
  await expect(oscillators).toBeFocused()
  await expect(page.getByTestId('oscillator-3-level')).toBeVisible()

  await oscillators.press('End')
  await expect(modulation).toBeFocused()
  await expect(page.getByTestId('filter-cutoff-control')).toBeVisible()
  await expect(page.getByTestId('oscillator-1-level')).toHaveCount(0)

  await page.keyboard.down('z')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.keyboard.up('z')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
})

test('WebMCP changes stay independent of the compact toolbar and tab navigation', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  const beforeHistory = await page.getByTestId('history-size').textContent()
  await page.evaluate(async () => {
    const tool = (await document.modelContext!.getTools()).find((candidate) => candidate.name === 'apply_patch')
    if (!tool) throw new Error('apply_patch was not registered')
    await document.modelContext!.executeTool(tool, { reason: 'Lower filter cutoff', changes: [{ path: 'filter.cutoffHz', value: 4100 }] })
  })
  await expect(page.getByRole('tab', { name: /Oscillators/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('last-change-indicator')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByRole('tab', { name: 'Effects' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('history-size')).toHaveText(String(Number(beforeHistory) + 1))
})

test('WebMCP hydrates a bright timbre table for a dry bass listening patch', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')

  const rawResult = await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const createPatch = tools.find((tool) => tool.name === 'create_patch')
    const applyPatch = tools.find((tool) => tool.name === 'apply_patch')
    if (!createPatch || !applyPatch) throw new Error('Required WebMCP tools were not registered')
    await document.modelContext!.executeTool(createPatch, {
      description: 'Start from the bass template',
      attributes: { category: 'bass' },
    })
    return document.modelContext!.executeTool(applyPatch, {
      reason: 'Prepare a dry source for listening tests',
      changes: [
        { op: 'timbre', character: 'bright', position: 0.7, target: 1 },
        { op: 'balance', osc1: 0.8, osc2: 0, osc3: 0 },
        { path: 'filter.enabled', value: false },
        { path: 'effects.distortion.enabled', value: false },
        { path: 'effects.chorus.enabled', value: false },
        { path: 'effects.delay.enabled', value: false },
        { path: 'effects.reverb.enabled', value: false },
      ],
    })
  })
  const result = JSON.parse(rawResult) as {
    ok?: boolean
    changed?: Record<string, { before: unknown; after: unknown }>
    current?: { osc1?: { wavetableId: string; wavetablePosition: number; level: number } }
  }

  expect(result.ok).not.toBe(false)
  expect(result.changed?.['oscillators.0.wavetableId']?.after).toBe('airy')
  expect(result.current?.osc1).toMatchObject({
    wavetableId: 'airy',
    wavetablePosition: 0.7,
    level: 0.8,
  })
})

test('permanent footer previews sustain until Stop and switches modes cleanly', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.getByRole('tab', { name: 'Effects' }).click()
  await page.getByTestId('preview-chord').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('3')
  await page.getByTestId('preview-arpeggiator').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.waitForTimeout(250)
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.getByTestId('preview-stop').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
})

test('effects render in a reorderable 3 row by 2 column grid without modulation panels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  const grid = page.getByTestId('effects-grid')
  const effectCards = grid.locator('[data-effect-id]')
  const effectOrder = () => effectCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-effect-id')))
  await expect(effectCards).toHaveCount(6)
  expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2)
  const filterBounds = await page.getByTestId('effect-card-filter').boundingBox()
  const filterPanelBounds = await page.getByTestId('effect-card-filter').locator('.filter-panel').boundingBox()
  const filterPlotBounds = await page.getByTestId('filter-plot').boundingBox()
  expect(filterBounds).not.toBeNull()
  expect(filterPanelBounds).not.toBeNull()
  expect(filterPlotBounds).not.toBeNull()
  expect(filterPlotBounds!.width).toBeGreaterThan(filterPanelBounds!.width - 24)
  expect(await effectOrder()).toEqual([
    'distortion',
    'filter',
    'compressor',
    'chorus',
    'delay',
    'reverb',
  ])
  await expect(page.getByRole('heading', { name: 'ENV 2' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'LFO' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Signal flow' })).toHaveCount(0)

  const reverbHandle = await page.getByRole('button', { name: 'Drag Reverb to reorder' }).boundingBox()
  const distortionCard = await page.getByTestId('effect-card-distortion').boundingBox()
  expect(reverbHandle).not.toBeNull()
  expect(distortionCard).not.toBeNull()
  await page.mouse.move(reverbHandle!.x + reverbHandle!.width / 2, reverbHandle!.y + reverbHandle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(distortionCard!.x + distortionCard!.width * .25, distortionCard!.y + distortionCard!.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect.poll(effectOrder).toEqual([
    'reverb',
    'distortion',
    'filter',
    'compressor',
    'chorus',
    'delay',
  ])
})

test('bypassed effects are greyed while their enable switches remain available', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  for (const effect of ['filter', 'delay', 'reverb']) {
    const card = page.getByTestId(`effect-card-${effect}`)
    const panel = card.locator('.effect-editor')
    const toggle = card.getByRole('switch', { name: new RegExp(`^${effect}$`, 'i') })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(panel).toHaveClass(/is-disabled/)
    await expect(panel.locator('.control-grid')).toHaveCSS('opacity', '0.34')
    await expect(toggle).toBeVisible()
  }
})

test('envelope keeps curve editing in the graph without duplicate curve or hold sliders', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('amp-hold')).toHaveCount(0)
  await expect(page.getByTestId('amp-attack-curve')).toHaveCount(0)
  await expect(page.getByTestId('amp-decay-curve')).toHaveCount(0)
  await expect(page.getByTestId('amp-release-curve')).toHaveCount(0)
  await expect(page.getByTestId('amp-attack-curve-handle')).toBeVisible()
  await expect(page.getByTestId('amp-decay-curve-handle')).toBeVisible()
  await expect(page.getByTestId('amp-release-curve-handle')).toBeVisible()
  await expect(page.getByTestId('lfo-1-curve-0')).toHaveClass(/graph-curve-handle/)
})

test('operation-written effect, filter, and envelope fields have real editors', async ({ page }) => {
  await page.goto('/')

  const initialGraph = await page.getByTestId('amp-envelope-path').getAttribute('d')
  await expect(page.getByTestId('amp-delay')).toBeVisible()
  await setRange(page, 'amp-delay', .3)
  for (const phase of ['attack', 'decay', 'release']) {
    const handle = page.getByTestId(`amp-${phase}-curve-handle`)
    await expect(handle).toHaveAccessibleName(`${phase[0].toUpperCase()}${phase.slice(1)} curve handle`)
    await handle.focus()
    await handle.press('ArrowRight')
    await handle.press('ArrowRight')
  }
  await expect(page.getByTestId('amp-envelope-path')).not.toHaveAttribute('d', initialGraph!)

  const attackCurveHandle = page.getByTestId('amp-attack-curve-handle')
  const handleBounds = await attackCurveHandle.boundingBox()
  expect(handleBounds).not.toBeNull()
  const beforeDragPath = await page.getByTestId('amp-envelope-path').getAttribute('d')
  const beforeDragCurve = Number(await attackCurveHandle.getAttribute('aria-valuenow'))
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2 + 9, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => Number(await attackCurveHandle.getAttribute('aria-valuenow'))).not.toBeCloseTo(beforeDragCurve)
  await expect(page.getByTestId('amp-envelope-path')).not.toHaveAttribute('d', beforeDragPath!)
  const draggedAttackCurve = Number(await attackCurveHandle.getAttribute('aria-valuenow'))

  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('effect-card-distortion').getByRole('heading', { name: 'Distortion' })).toBeVisible()
  await expect(page.getByTestId('effect-card-chorus').getByRole('heading', { name: 'Chorus' })).toBeVisible()
  await expect(page.getByTestId('distortion-type')).toBeVisible()
  await expect(page.getByTestId('distortion-drive')).toBeVisible()
  await expect(page.getByTestId('chorus-voices')).toBeVisible()
  await expect(page.getByTestId('chorus-mix')).toBeVisible()
  await expect(page.getByTestId('chorus-voices')).toHaveAttribute('aria-valuemax', '4')
  await expect(page.getByTestId('chorus-rate')).toHaveAttribute('aria-valuemin', '0')
  await expect(page.getByTestId('chorus-rate')).toHaveAttribute('aria-valuemax', '1')
  await expect(page.getByTestId('chorus-feedback')).toHaveAttribute('aria-valuemax', '1')
  await expect(page.getByTestId('filter-slope')).toBeVisible()
  await expect(page.getByTestId('filter-drive')).toBeVisible()
  await expect(page.getByTestId('filter-keytrack')).toBeVisible()

  if (await page.getByTestId('distortion-enabled').getAttribute('aria-checked') === 'false') await page.getByTestId('distortion-enabled').click()
  await page.getByTestId('distortion-type').selectOption('sine_fold')
  await setRange(page, 'distortion-drive', .63)
  await setRange(page, 'distortion-mix', .71)
  if (await page.getByTestId('chorus-enabled').getAttribute('aria-checked') === 'false') await page.getByTestId('chorus-enabled').click()
  await setRange(page, 'chorus-voices', 4)
  await setRange(page, 'chorus-rate', .73)
  await setRange(page, 'chorus-depth', .58)
  await setRange(page, 'chorus-feedback', .31)
  await setRange(page, 'chorus-mix', .46)
  await page.getByTestId('filter-slope').selectOption('24')
  await setRange(page, 'filter-drive', .37)
  await setRange(page, 'filter-keytrack', .68)
  await expect(page.getByTestId('distortion-enabled')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('distortion-type')).toHaveValue('sine_fold')
  await expect(page.getByTestId('filter-slope')).toHaveValue('24')

  await page.getByRole('tab', { name: 'Oscillators' }).click()
  await expect(page.getByTestId('amp-delay')).toHaveAttribute('data-parameter-value', '0.3')
  await expect.poll(async () => Number(await page.getByTestId('amp-attack-curve-handle').getAttribute('aria-valuenow'))).toBeCloseTo(draggedAttackCurve)
  await expect.poll(async () => Number(await page.getByTestId('amp-decay-curve-handle').getAttribute('aria-valuenow'))).toBeCloseTo(0)
  await expect.poll(async () => Number(await page.getByTestId('amp-release-curve-handle').getAttribute('aria-valuenow'))).toBeCloseTo(0)
  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByTestId('distortion-enabled')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('distortion-type')).toHaveValue('sine_fold')
  await expect(page.getByTestId('chorus-enabled')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('filter-slope')).toHaveValue('24')
  for (const [id, value] of [['distortion-drive', '.63'], ['distortion-mix', '.71'], ['chorus-voices', '4'], ['chorus-rate', '.73'], ['chorus-depth', '.58'], ['chorus-feedback', '.31'], ['chorus-mix', '.46'], ['filter-drive', '.37'], ['filter-keytrack', '.68']] as const) {
    await expectParameter(page, id, Number(value))
  }
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByTestId('filter-keytrack')).not.toHaveAttribute('data-parameter-value', '0.68')
})

test('mobile drag bar can move an effect down', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  const effectCards = page.getByTestId('effects-grid').locator('[data-effect-id]')
  const effectOrder = () => effectCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-effect-id')))
  const distortionHandle = await page.getByRole('button', { name: 'Drag Distortion to reorder' }).boundingBox()
  expect(distortionHandle).not.toBeNull()

  await page.mouse.move(distortionHandle!.x + distortionHandle!.width / 2, distortionHandle!.y + 60)
  await page.mouse.down()
  await page.mouse.move(distortionHandle!.x + distortionHandle!.width / 2, 838, { steps: 12 })
  await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true)
  await page.mouse.up()
  await expect.poll(effectOrder).toEqual(DISTORTION_LAST_ORDER)

  const movedDistortionHandle = await page.getByRole('button', { name: 'Drag Distortion to reorder' }).boundingBox()
  const filterCard = await page.getByTestId('effect-card-filter').boundingBox()
  expect(movedDistortionHandle).not.toBeNull()
  expect(filterCard).not.toBeNull()
  await page.mouse.move(movedDistortionHandle!.x + movedDistortionHandle!.width / 2, movedDistortionHandle!.y + movedDistortionHandle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(filterCard!.x + filterCard!.width / 2, filterCard!.y + filterCard!.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect.poll(effectOrder).toEqual([
    'distortion',
    'filter',
    'compressor',
    'chorus',
    'delay',
    'reverb',
  ])
})

test('first and last effects are valid drag endpoints', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  const effectCards = page.getByTestId('effects-grid').locator('[data-effect-id]')
  const effectOrder = () => effectCards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-effect-id')))
  const distortionHandle = await page.getByRole('button', { name: 'Drag Distortion to reorder' }).boundingBox()
  const reverbCard = await page.getByTestId('effect-card-reverb').boundingBox()
  expect(distortionHandle).not.toBeNull()
  expect(reverbCard).not.toBeNull()

  await page.mouse.move(distortionHandle!.x + distortionHandle!.width / 2, distortionHandle!.y + distortionHandle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(reverbCard!.x + reverbCard!.width * .8, reverbCard!.y + reverbCard!.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect.poll(effectOrder).toEqual([
    'filter',
    'compressor',
    'chorus',
    'delay',
    'reverb',
    'distortion',
  ])
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-effective-effects-order',
    'filter,compressor,chorus,delay,reverb,distortion',
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    settings: { effect_chain_order: number }
  }
  expect(exported.settings.effect_chain_order).toBe(encodeVitalEffectOrder(DISTORTION_LAST_ORDER))
  await page.getByRole('tab', { name: 'Oscillators' }).click()
  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect.poll(effectOrder).toEqual(DISTORTION_LAST_ORDER)
})
