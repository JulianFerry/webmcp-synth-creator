import { expect, test, type Page } from '@playwright/test'

async function setRange(page: Page, testId: string, value: number): Promise<void> {
  const control = page.getByTestId(testId)
  await control.focus()
  await control.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement
    input.value = String(nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await control.blur()
}

async function effectPanelDimensions(page: Page) {
  return page.getByTestId('effects-grid').locator('.effect-editor').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      effect: element.closest('[data-effect-id]')?.getAttribute('data-effect-id'),
      height: Math.round(bounds.height),
      overflow: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
      width: Math.round(bounds.width),
    }
  }))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()
})

test('effect cards share dimensions and chorus uses a three by two control grid', async ({ page }) => {
  await page.getByRole('tab', { name: /Oscillators/ }).click()
  const modulatorGraphWidth = await page.locator('.oscillators-workspace > .envelope-panel .envelope-plot').evaluate((element) => {
    const svg = element as SVGSVGElement
    const bounds = svg.getBoundingClientRect()
    return Math.min(bounds.width, bounds.height * svg.viewBox.baseVal.width / svg.viewBox.baseVal.height)
  })
  await page.getByRole('tab', { name: 'Effects' }).click()
  const panels = page.getByTestId('effects-grid').locator('.effect-editor')
  await expect(panels).toHaveCount(6)
  expect(await page.getByTestId('effects-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
  expect((await page.locator('.fx-module-drag-handle').first().boundingBox())!.width).toBeCloseTo(15, 0)

  const dimensions = await effectPanelDimensions(page)
  expect(new Set(dimensions.map(({ height }) => height)).size).toBe(1)
  expect(new Set(dimensions.map(({ width }) => width)).size).toBe(1)
  expect(await page.locator('.chorus-controls').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
  expect(await page.locator('.chorus-controls').evaluate((element) => getComputedStyle(element).gridTemplateRows.split(' ').length)).toBe(2)
  await expect(page.getByTestId('effects-grid').locator('.eyebrow')).toHaveCount(0)

  const visualWidths = await page.getByTestId('effects-grid').locator('.effect-editor').evaluateAll((elements) => elements.map((element) => {
    const visual = element.querySelector('.filter-plot, .effect-value-visual')
    return visual ? visual.getBoundingClientRect().width / element.getBoundingClientRect().width : 0
  }))
  expect(visualWidths.every((ratio) => ratio > .9)).toBe(true)
  const effectGraphWidths = await page.locator('.filter-plot svg, .effect-value-visual > svg').evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  )
  expect(Math.max(...effectGraphWidths) - Math.min(...effectGraphWidths)).toBeLessThanOrEqual(16)
  expect(effectGraphWidths.every((width) => width <= modulatorGraphWidth)).toBe(true)

  const filterCaption = page.getByTestId('filter-cutoff')
  const effectCaption = page.getByTestId('distortion-visual').locator('figcaption strong')
  const captionStyles = await Promise.all([filterCaption, effectCaption].map((caption) => caption.evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, family: style.fontFamily, size: style.fontSize, weight: style.fontWeight }
  })))
  expect(captionStyles[0]).toEqual(captionStyles[1])

})

test('effect cards retain the equal compact layout on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.reload()
  await page.getByRole('tab', { name: 'Effects' }).click()

  const dimensions = await effectPanelDimensions(page)
  expect(new Set(dimensions.map(({ height }) => height)).size).toBe(1)
  expect(new Set(dimensions.map(({ width }) => width)).size).toBe(1)
  expect(dimensions.filter(({ overflow }) => overflow)).toEqual([])
  expect(await page.locator('.chorus-controls').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
})

test('effect thumbs match and connectors stay between cards while resizing', async ({ page }) => {
  const thumbTokens = await Promise.all(['filter-cutoff-control', 'distortion-drive'].map((testId) =>
    page.getByTestId(testId).evaluate((element) => {
      const style = getComputedStyle(element.closest('.parameter-control')!)
      return {
        color: style.getPropertyValue('--slider-thumb-color').trim(),
        edge: style.getPropertyValue('--slider-thumb-edge').trim(),
        ring: style.getPropertyValue('--slider-thumb-ring').trim(),
        size: style.getPropertyValue('--slider-thumb-size').trim(),
      }
    }),
  ))
  expect(thumbTokens[0]).toEqual(thumbTokens[1])

  for (const width of [1180, 1000, 720]) {
    await page.setViewportSize({ width, height: 900 })
    const filterGeometry = await page.getByTestId('effect-card-filter').evaluate((card) => {
      const panel = card.querySelector('.effect-editor')!.getBoundingClientRect()
      const heading = card.querySelector('.panel-heading')!.getBoundingClientRect()
      const toggle = card.querySelector('[data-testid="filter-enabled"]')!.getBoundingClientRect()
      const connector = card.querySelector('.fx-grid-connector')!.getBoundingClientRect()
      const grid = card.closest('.fx-grid')!.getBoundingClientRect()
      return {
        connectorBottom: connector.bottom,
        connectorLeft: connector.left,
        connectorRight: connector.right,
        connectorTop: connector.top,
        gridRight: grid.right,
        panelBottom: panel.bottom,
        panelLeft: panel.left,
        headingRight: heading.right,
        panelRight: panel.right,
        panelTop: panel.top,
        scrollWidth: (card.querySelector('.effect-editor') as HTMLElement).scrollWidth,
        clientWidth: (card.querySelector('.effect-editor') as HTMLElement).clientWidth,
        toggleRight: toggle.right,
      }
    })
    const horizontalOverlap = Math.min(filterGeometry.panelRight, filterGeometry.connectorRight) - Math.max(filterGeometry.panelLeft, filterGeometry.connectorLeft)
    const verticalOverlap = Math.min(filterGeometry.panelBottom, filterGeometry.connectorBottom) - Math.max(filterGeometry.panelTop, filterGeometry.connectorTop)
    expect(filterGeometry.scrollWidth, `filter scroll width at ${width}px`).toBeLessThanOrEqual(filterGeometry.clientWidth)
    expect(filterGeometry.headingRight, `filter heading at ${width}px`).toBeLessThanOrEqual(filterGeometry.panelRight)
    expect(filterGeometry.toggleRight, `filter toggle at ${width}px`).toBeLessThanOrEqual(filterGeometry.panelRight)
    expect(filterGeometry.panelRight, `filter panel at ${width}px`).toBeLessThanOrEqual(filterGeometry.gridRight)
    expect(horizontalOverlap <= 1 || verticalOverlap <= 1, `filter connector overlap at ${width}px`).toBe(true)
  }

  await page.setViewportSize({ width: 390, height: 900 })
  const mobileConnectors = await page.getByTestId('effects-grid').locator('.fx-grid-module').evaluateAll((cards) =>
    cards.slice(0, -1).map((card, index) => {
      const panel = card.querySelector('.effect-editor')!.getBoundingClientRect()
      const connector = card.querySelector('.fx-grid-connector')!.getBoundingClientRect()
      const nextPanel = cards[index + 1].querySelector('.effect-editor')!.getBoundingClientRect()
      return { connectorBottom: connector.bottom, connectorTop: connector.top, nextTop: nextPanel.top, panelBottom: panel.bottom }
    }),
  )
  for (const geometry of mobileConnectors) {
    expect(geometry.connectorTop).toBeGreaterThanOrEqual(geometry.panelBottom - 1)
    expect(geometry.connectorBottom).toBeLessThanOrEqual(geometry.nextTop + 1)
  }
})

test('effect graphs match the single-column envelope width at the narrow workspace breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 900 })
  await page.reload()
  const envelopeWidth = await page.locator('.oscillators-workspace > .envelope-panel .envelope-plot').evaluate((element) => {
    const svg = element as SVGSVGElement
    const bounds = svg.getBoundingClientRect()
    return Math.min(bounds.width, bounds.height * svg.viewBox.baseVal.width / svg.viewBox.baseVal.height)
  })
  const lfoWidth = await page.locator('.oscillators-workspace > .lfo-panel .editable-graph').first().evaluate((element) => {
    const svg = element as SVGSVGElement
    const bounds = svg.getBoundingClientRect()
    return Math.min(bounds.width, bounds.height * svg.viewBox.baseVal.width / svg.viewBox.baseVal.height)
  })
  await page.getByRole('tab', { name: 'Effects' }).click()

  const filterWidth = await page.getByTestId('filter-plot').locator('svg').evaluate((element) => element.getBoundingClientRect().width)
  const cardWidth = await page.getByTestId('effect-card-filter').evaluate((element) => element.getBoundingClientRect().width)
  expect(filterWidth / cardWidth).toBeGreaterThan(.4)
  expect(filterWidth / envelopeWidth).toBeGreaterThan(.9)
  expect(filterWidth / envelopeWidth).toBeLessThan(1.1)
  expect(filterWidth / lfoWidth).toBeGreaterThan(.9)
  expect(filterWidth / lfoWidth).toBeLessThan(1.1)
  const effectWidths = await page.locator('.filter-plot svg, .effect-value-visual > svg').evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  )
  expect(effectWidths.every((width) => width / envelopeWidth > .9 && width / envelopeWidth < 1.1)).toBe(true)
  expect(await page.getByTestId('effects-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1)
  expect(await page.locator('.chorus-controls').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

test('effect displays expose value-driven delay, reverb, compressor, and distortion geometry', async ({ page }) => {
  for (const id of ['delay-visual', 'reverb-visual', 'compressor-visual', 'distortion-visual']) {
    await expect(page.getByTestId(id)).toBeVisible()
  }

  const delayPath = await page.getByTestId('delay-taps-path').getAttribute('d')
  await setRange(page, 'delay-feedback', .83)
  await expect(page.getByTestId('delay-taps-path')).not.toHaveAttribute('d', delayPath!)

  const reverbPath = await page.getByTestId('reverb-tail-path').getAttribute('d')
  await setRange(page, 'reverb-size', .82)
  await expect(page.getByTestId('reverb-tail-path')).not.toHaveAttribute('d', reverbPath!)

  const compressorPath = await page.getByTestId('compressor-curve-path').getAttribute('d')
  await setRange(page, 'compressor-amount', .86)
  await expect(page.getByTestId('compressor-curve-path')).not.toHaveAttribute('d', compressorPath!)
  await page.getByRole('button', { name: 'Low-band compression' }).click()
  await expect(page.getByRole('button', { name: 'Low-band compression' })).toHaveAttribute('aria-pressed', 'true')

  await setRange(page, 'distortion-mix', .7)
  const distortionPath = await page.getByTestId('distortion-transfer-path').getAttribute('d')
  await setRange(page, 'distortion-drive', .91)
  await expect(page.getByTestId('distortion-transfer-path')).not.toHaveAttribute('d', distortionPath!)
})

test('clicking an effect drag handle without moving is a no-op', async ({ page }) => {
  const handle = page.getByTestId('effect-card-filter').locator('.fx-module-drag-handle')
  const box = await handle.boundingBox()
  if (!box) throw new Error('Effect drag handle is not visible')
  const origin = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 9, pointerType: 'mouse', bubbles: true }
  await handle.dispatchEvent('pointerdown', origin)
  await handle.dispatchEvent('pointermove', origin)
  await handle.dispatchEvent('pointerup', origin)

  await expect(page.getByTestId('history-size')).toHaveText('0')
  await page.waitForTimeout(100)
  await expect(page.getByRole('alert', { name: 'The command did not change any patch values', exact: true })).toHaveCount(0)
})
