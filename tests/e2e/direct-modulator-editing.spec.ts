import { expect, test, type Locator, type Page } from '@playwright/test'

async function dragBy(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Editor handle is not visible')
  const origin = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 7, pointerType: 'mouse', bubbles: true }
  await locator.dispatchEvent('pointerdown', origin)
  await locator.dispatchEvent('pointermove', { ...origin, clientX: origin.clientX + dx, clientY: origin.clientY + dy })
  await locator.dispatchEvent('pointerup', { ...origin, clientX: origin.clientX + dx, clientY: origin.clientY + dy })
}

test('direct envelope and LFO gestures are atomic, undoable, and cancellable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('lfo-rate-mode')).toHaveCount(0)
  await expect(page.locator('label[for="lfo-phase"]')).toHaveClass(/parameter-control-slider/)
  const history = page.getByTestId('history-size')
  const sustain = page.getByTestId('amp-decay-sustain-handle')
  const sustainSlider = page.getByTestId('amp-sustain')
  const sustainBefore = await sustainSlider.inputValue()

  const sustainBox = await sustain.boundingBox()
  if (!sustainBox) throw new Error('Sustain handle is not visible')
  const origin = { clientX: sustainBox.x + sustainBox.width / 2, clientY: sustainBox.y + sustainBox.height / 2, pointerId: 8, pointerType: 'mouse', bubbles: true }
  await sustain.dispatchEvent('pointerdown', origin)
  await sustain.dispatchEvent('pointermove', { ...origin, clientY: origin.clientY - 18 })
  await expect(history).toHaveText('0')
  await expect(sustainSlider).not.toHaveValue(sustainBefore)
  await sustain.dispatchEvent('pointerup', { ...origin, clientY: origin.clientY - 18 })
  await expect(history).toHaveText('1')
  await expect(sustainSlider).not.toHaveValue(sustainBefore)
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(history).toHaveText('0')
  await expect(sustainSlider).toHaveValue(sustainBefore)

  const point = page.getByTestId('lfo-point-1')
  const pointBefore = await point.getAttribute('aria-valuetext')
  await dragBy(page, point, 12, 10)
  await expect(history).toHaveText('1')
  await expect(point).not.toHaveAttribute('aria-valuetext', pointBefore ?? '')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(point).toHaveAttribute('aria-valuetext', pointBefore ?? '')

  const box = await sustain.boundingBox()
  if (!box) throw new Error('Sustain handle is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 20)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(history).toHaveText('0')
  await expect(sustainSlider).toHaveValue(sustainBefore)
})

test('focused handles commit one transaction on key-up', async ({ page }) => {
  await page.goto('/')
  const sustain = page.getByTestId('amp-decay-sustain-handle')
  await sustain.focus()
  await page.keyboard.down('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  await page.keyboard.up('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText('1')

  const point = page.getByTestId('lfo-point-1')
  await point.focus()
  await page.keyboard.down('ArrowRight')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await page.keyboard.up('ArrowRight')
  await expect(page.getByTestId('history-size')).toHaveText('2')
})

test('dragging time and LFO handles left decreases values without snapping right', async ({ page }) => {
  await page.goto('/')
  const history = page.getByTestId('history-size')

  for (const testId of ['amp-attack-handle', 'amp-decay-sustain-handle']) {
    const handle = page.getByTestId(testId)
    const before = Number(await handle.getAttribute('aria-valuenow'))
    await dragBy(page, handle, -10, 0)
    const after = Number(await handle.getAttribute('aria-valuenow'))
    expect(after).toBeLessThan(before)
    await expect(history).toHaveText('1')
    await page.getByRole('button', { name: 'Undo transaction' }).click()
    await expect(history).toHaveText('0')
  }

  const point = page.getByTestId('lfo-point-1')
  const beforePhase = Number((await point.getAttribute('aria-valuetext'))?.match(/^\d+/)?.[0])
  await dragBy(page, point, -12, 0)
  const afterPhase = Number((await point.getAttribute('aria-valuetext'))?.match(/^\d+/)?.[0])
  expect(afterPhase).toBeLessThan(beforePhase)
  await expect(history).toHaveText('1')
})

test('AHDSR exposes hold and combines decay with sustain while LFO handles alternate', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('amp-hold')).toBeVisible()
  await expect(page.getByTestId('amp-hold-handle')).toBeVisible()
  await expect(page.getByTestId('amp-decay-handle')).toHaveCount(0)
  await expect(page.getByTestId('amp-sustain-handle')).toHaveCount(0)

  const kinds = await page.locator('.lfo-plot [data-handle-kind]').evaluateAll((handles) =>
    handles.map((handle) => handle.getAttribute('data-handle-kind')),
  )
  expect(kinds).toEqual(kinds.map((_, index) => index % 2 === 0 ? 'position' : 'curve'))
  const adsrHandle = await page.getByTestId('amp-attack-handle').boundingBox()
  const lfoHandle = await page.getByTestId('lfo-point-0').boundingBox()
  expect(Math.abs(adsrHandle!.width - lfoHandle!.width)).toBeLessThan(1)
  const envelopeGraph = page.locator('.oscillator-modulator-row .envelope-plot')
  const lfoGraph = page.locator('.oscillator-modulator-row .lfo-plot')
  const [envelopeBox, lfoBox, envelopePanel, lfoPanel] = await Promise.all([
    envelopeGraph.boundingBox(), lfoGraph.boundingBox(),
    page.locator('.oscillator-modulator-row .envelope-panel').boundingBox(),
    page.locator('.oscillator-modulator-row .lfo-panel').boundingBox(),
  ])
  expect(Math.abs(envelopeBox!.width - lfoBox!.width)).toBeLessThan(1)
  expect(Math.abs(envelopeBox!.height - lfoBox!.height)).toBeLessThan(1)
  expect(envelopeBox!.height).toBeLessThanOrEqual(126)
  expect(envelopeBox!.height).toBeGreaterThanOrEqual(118)
  expect(envelopeBox!.width / envelopePanel!.width).toBeGreaterThan(.94)
  expect(lfoBox!.width / lfoPanel!.width).toBeGreaterThan(.94)
  for (const graph of [envelopeGraph, lfoGraph.locator('svg')]) {
    const spans = await graph.evaluate((svg) => {
      const viewBox = (svg as SVGSVGElement).viewBox.baseVal
      const grid = svg.querySelector<SVGGraphicsElement>('.plot-grid')!.getBBox()
      const plot = svg.querySelector<SVGGraphicsElement>('.plot-line')!.getBBox()
      return { grid: grid.width / viewBox.width, plot: plot.width / viewBox.width }
    })
    expect(spans.grid).toBeGreaterThan(.95)
    expect(spans.plot).toBeGreaterThan(.9)
  }
  const handleDiameters = await Promise.all([
    page.getByTestId('amp-attack-handle').getAttribute('data-handle-diameter'),
    page.getByTestId('lfo-point-0').getAttribute('data-handle-diameter'),
    page.getByTestId('lfo-curve-0').getAttribute('data-handle-diameter'),
  ])
  expect(handleDiameters).toEqual(['12', '12', '12'])
  const handleStyles = await Promise.all([
    page.getByTestId('amp-attack-handle').evaluate((element) => ({ fill: getComputedStyle(element).fill, stroke: getComputedStyle(element).stroke, strokeWidth: getComputedStyle(element).strokeWidth })),
    page.getByTestId('lfo-point-0').evaluate((element) => ({ fill: getComputedStyle(element).fill, stroke: getComputedStyle(element).stroke, strokeWidth: getComputedStyle(element).strokeWidth })),
  ])
  expect(handleStyles[0]).toEqual(handleStyles[1])
  const restrainedStyles = await Promise.all([
    page.getByTestId('amp-attack-handle').evaluate((element) => getComputedStyle(element).filter),
    page.getByTestId('lfo-point-0').evaluate((element) => getComputedStyle(element).filter),
    envelopeGraph.locator('.plot-line').evaluate((element) => ({
      filter: getComputedStyle(element).filter,
      stroke: getComputedStyle(element).stroke,
      strokeWidth: getComputedStyle(element).strokeWidth,
    })),
    lfoGraph.locator('.plot-line').evaluate((element) => ({
      filter: getComputedStyle(element).filter,
      stroke: getComputedStyle(element).stroke,
      strokeWidth: getComputedStyle(element).strokeWidth,
    })),
  ])
  expect(restrainedStyles).toEqual([
    'none',
    'none',
    { filter: 'none', stroke: 'rgba(39, 179, 194, 0.68)', strokeWidth: '1.25px' },
    { filter: 'none', stroke: 'rgba(39, 179, 194, 0.68)', strokeWidth: '1.25px' },
  ])
})
