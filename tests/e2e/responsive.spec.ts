import { expect, test, type Locator, type Page } from '@playwright/test'

type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>

async function boxes(locator: Locator): Promise<Box[]> {
  const count = await locator.count()
  const result = await Promise.all(Array.from({ length: count }, (_, index) => locator.nth(index).boundingBox()))
  expect(result.every(Boolean)).toBe(true)
  return result as Box[]
}

async function openAt(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('tabpanel')).toBeVisible()
}

test('desktop keeps the overview in its wide composition', async ({ page }) => {
  await openAt(page, 1280)

  const analysis = await boxes(page.locator('.overview-analysis-row > section'))
  expect(analysis[0].y).toBe(analysis[1].y)
  expect(analysis[0].width / analysis[1].width).toBeGreaterThan(1.4)
  expect(analysis[0].width / analysis[1].width).toBeLessThan(1.6)

  const oscillators = await boxes(page.locator('.oscillator-overview-card'))
  expect(oscillators).toHaveLength(3)
  expect(new Set(oscillators.map((box) => Math.round(box.y))).size).toBe(1)

  const modulators = await boxes(page.locator('.overview-tab-grid > .envelope-panel, .overview-tab-grid > .lfo-panel'))
  expect(modulators[0].y).toBe(modulators[1].y)
  expect(Math.abs(modulators[0].width - modulators[1].width)).toBeLessThan(2)
  const keyboard = await page.getByTestId('keyboard-surface').boundingBox()
  const keyboardColumn = await page.locator('.keyboard-column').boundingBox()
  expect(keyboard).not.toBeNull()
  expect(keyboardColumn).not.toBeNull()
  expect(Math.abs(keyboard!.width - keyboardColumn!.width)).toBeLessThan(2)
})

test('tablet uses equal analysis panels and a two-plus-one oscillator deck', async ({ page }) => {
  await openAt(page, 834)

  const analysis = await boxes(page.locator('.overview-analysis-row > section'))
  expect(analysis[0].y).toBe(analysis[1].y)
  expect(Math.abs(analysis[0].width - analysis[1].width)).toBeLessThan(2)

  const oscillators = await boxes(page.locator('.oscillator-overview-card'))
  expect(oscillators[0].y).toBe(oscillators[1].y)
  expect(oscillators[2].y).toBeGreaterThan(oscillators[0].y + oscillators[0].height)

  const modulators = await boxes(page.locator('.overview-tab-grid > .envelope-panel, .overview-tab-grid > .lfo-panel'))
  expect(modulators[0].y).toBe(modulators[1].y)
  expect(Math.abs(modulators[0].width - modulators[1].width)).toBeLessThan(2)

  const tabs = await boxes(page.getByRole('tab'))
  expect(Math.min(...tabs.map((box) => box.height))).toBeGreaterThanOrEqual(48)
})

test('mobile stacks overview rows and preserves scrollable touch surfaces', async ({ page }) => {
  await openAt(page, 360)

  const analysis = await boxes(page.locator('.overview-analysis-row > section'))
  expect(analysis[1].y).toBeGreaterThan(analysis[0].y + analysis[0].height)

  const oscillators = await boxes(page.locator('.oscillator-overview-card'))
  expect(oscillators[1].y).toBeGreaterThan(oscillators[0].y + oscillators[0].height)
  expect(oscillators[2].y).toBeGreaterThan(oscillators[1].y + oscillators[1].height)

  const modulators = await boxes(page.locator('.overview-tab-grid > .envelope-panel, .overview-tab-grid > .lfo-panel'))
  expect(modulators[1].y).toBeGreaterThan(modulators[0].y + modulators[0].height)

  const tabOverflow = await page.locator('.workbench-tablist').evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }))
  expect(tabOverflow.overflowX).toBe('auto')
  expect(tabOverflow.scrollWidth).toBeGreaterThan(tabOverflow.clientWidth)

  const keyboard = page.getByTestId('keyboard-surface')
  const keyboardOverflow = await keyboard.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }))
  expect(keyboardOverflow.overflowX).toBe('auto')
  expect(keyboardOverflow.scrollWidth).toBeGreaterThan(keyboardOverflow.clientWidth)

  const keys = await boxes(keyboard.getByRole('button'))
  expect(Math.min(...keys.map((box) => box.width))).toBeGreaterThanOrEqual(44)
  const tabs = await boxes(page.getByRole('tab'))
  expect(Math.min(...tabs.map((box) => box.height))).toBeGreaterThanOrEqual(44)

  await page.locator('.diagnostic-drawer > summary').click()
  const parameterColumns = await page.locator('.parameter-grid').first().evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length,
  )
  expect(parameterColumns).toBe(1)
})
