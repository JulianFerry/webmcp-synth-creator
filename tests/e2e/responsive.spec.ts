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

test('desktop keeps oscillators, permanent sidebar, and footer in one workstation', async ({ page }) => {
  await openAt(page, 1160)

  const stage = await page.locator('.workbench-stage').boundingBox()
  const sidebar = await page.locator('.workbench-sidebar').boundingBox()
  const footer = await page.locator('.audition-footer').boundingBox()
  await expect(page.locator('.global-patch-bar')).toHaveCount(0)
  expect(stage).not.toBeNull()
  expect(sidebar).not.toBeNull()
  expect(footer).not.toBeNull()
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(stage!.x)
  expect(Math.abs(sidebar!.y - stage!.y)).toBeLessThan(2)
  expect(sidebar!.width).toBeCloseTo(260, 0)
  expect(footer!.width).toBeGreaterThan(stage!.width)
  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveCount(0)

  const oscillators = await boxes(page.locator('.detailed-oscillator-editor'))
  expect(oscillators).toHaveLength(3)
  expect(new Set(oscillators.map((box) => Math.round(box.y))).size).toBe(1)

  const modulators = await boxes(page.locator('.oscillator-modulator-row > article'))
  expect(modulators).toHaveLength(2)
  expect(modulators[0].y).toBe(modulators[1].y)
  expect(modulators[0].y).toBeGreaterThan(oscillators[0].y + oscillators[0].height)
  expect(Math.max(...modulators.map((box) => box.y + box.height))).toBeLessThanOrEqual(1000)

  const variantButtons = await boxes(page.locator('.variant-comparison-card > .variant-button'))
  const spectrograms = await boxes(page.locator('.variant-spectrum'))
  expect(variantButtons).toHaveLength(2)
  expect(spectrograms).toHaveLength(2)
  expect(spectrograms[1].y).toBeGreaterThan(spectrograms[0].y + spectrograms[0].height)
  expect(Math.abs(variantButtons[0].y + variantButtons[0].height - spectrograms[0].y)).toBeLessThanOrEqual(2)
  expect(Math.abs(variantButtons[1].y + variantButtons[1].height - spectrograms[1].y)).toBeLessThanOrEqual(2)
  const attributeRows = await boxes(page.locator('.variant-spectrum-a .attribute-row'))
  expect(attributeRows[0].y).toBe(attributeRows[1].y)
  expect(attributeRows[2].y).toBe(attributeRows[3].y)
  await expect(page.getByTestId('variant-a-spectrogram')).toHaveAttribute('data-color', '#27b3c2')
  await expect(page.getByTestId('variant-b-spectrogram')).toHaveAttribute('data-color', '#7e5ac7')
  await expect(page.locator('.sidebar-title')).toHaveText('WAVETABLE WORKBENCH')
  await expect(page.locator('.sidebar-section-heading').first()).toContainText('Patch')
  const transferRows = page.locator('.sidebar-transfer-row')
  await expect(transferRows).toHaveCount(2)
  await expect(transferRows.nth(0).locator('select')).toHaveCount(1)
  await expect(transferRows.nth(0).locator('button')).toHaveCount(0)
  await expect(transferRows.nth(1).locator('select')).toHaveCount(0)
  await expect(transferRows.nth(1).locator('button')).toHaveCount(2)
  const preset = await transferRows.nth(0).locator('select').boundingBox()
  const transferButtons = await boxes(transferRows.nth(1).locator('button'))
  expect(transferButtons[0].y).toBeCloseTo(transferButtons[1].y, 0)
  expect(preset!.y + preset!.height).toBeLessThanOrEqual(transferButtons[0].y)
  await expect(page.getByTestId('variant-a-spectrogram')).toHaveCSS('height', '118px')

  const lfoControlLabels = await page.locator('.lfo-controls > label > span:first-child').allTextContents()
  expect(lfoControlLabels).toEqual(['Division', 'Shape mode', 'Phase'])

  await expect(page.getByTestId('keyboard-surface').getByRole('button')).toHaveCount(25)
  await expect(page.getByTestId('preview-note')).toBeVisible()
  await expect(page.getByTestId('preview-chord')).toBeVisible()
  await expect(page.getByTestId('preview-arpeggiator')).toBeVisible()
  await expect(page.getByTestId('preview-stop')).toBeVisible()
  const keyboardKey = await page.getByTestId('note-48').boundingBox()
  expect(keyboardKey!.height).toBeLessThanOrEqual(44)
  const preview = await page.locator('.footer-preview-controls').boundingBox()
  const keyboard = await page.locator('.audition-footer .keyboard-column').boundingBox()
  expect(preview!.x).toBeLessThan(keyboard!.x)
  await expect(page.getByTestId('preview-stop')).toHaveCSS('color', 'rgb(255, 113, 130)')
  await expect(page.getByTestId('preview-note')).not.toHaveCSS('color', 'rgb(231, 237, 244)')

  await page.setViewportSize({ width: 1160, height: 1400 })
  const shortPageFooter = await page.locator('.audition-footer').boundingBox()
  expect(shortPageFooter!.y + shortPageFooter!.height).toBeCloseTo(1400, 0)
})

test('tablet preserves the left sidebar while stacking oscillator editors', async ({ page }) => {
  await openAt(page, 1160)
  const desktopSidebar = await page.locator('.workbench-sidebar').boundingBox()
  await openAt(page, 1120)
  const wideTabletSidebar = await page.locator('.workbench-sidebar').boundingBox()
  const wideTabletOscillators = await boxes(page.locator('.detailed-oscillator-editor'))
  expect(wideTabletSidebar!.width).toBeLessThan(desktopSidebar!.width)
  expect(wideTabletOscillators[1].y).toBeGreaterThan(wideTabletOscillators[0].y + wideTabletOscillators[0].height - 1)
  await openAt(page, 720)
  const stage = await page.locator('.workbench-stage').boundingBox()
  const sidebar = await page.locator('.workbench-sidebar').boundingBox()
  expect(stage).not.toBeNull()
  expect(sidebar).not.toBeNull()
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(stage!.x)
  expect(sidebar!.width).toBeLessThan(wideTabletSidebar!.width)

  const oscillators = await boxes(page.locator('.detailed-oscillator-editor'))
  expect(oscillators[1].y).toBeGreaterThan(oscillators[0].y + oscillators[0].height - 1)
  expect(oscillators[2].y).toBeGreaterThan(oscillators[1].y + oscillators[1].height - 1)
  for (const number of [1, 2, 3]) {
    const editor = page.getByTestId(`oscillator-${number}-editor`)
    const stage = await editor.locator('.detailed-oscillator-waveform').boundingBox()
    const position = await page.locator(`label[for="oscillator-${number}-position"]`).boundingBox()
    const positionVisual = await page.getByTestId(`oscillator-${number}-position-visual`).boundingBox()
    const controls = await editor.locator('.oscillator-control-rows').boundingBox()
    const selectorRow = await editor.locator('.oscillator-wavetable-row').boundingBox()
    const wavetable = await editor.getByRole('combobox', { name: 'Wavetable' }).boundingBox()
    const header = await editor.locator('.detailed-oscillator-header').boundingBox()
    expect(position!.x + position!.width).toBeLessThanOrEqual(stage!.x)
    expect(controls!.x).toBeGreaterThan(stage!.x + stage!.width)
    expect(Math.abs(position!.y - stage!.y)).toBeLessThan(2)
    expect(Math.abs((positionVisual!.x + positionVisual!.width / 2) - (position!.x + position!.width / 2))).toBeLessThan(.5)
    expect(selectorRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    expect(selectorRow!.width).toBeCloseTo(header!.width, 0)
    expect(wavetable!.width).toBeGreaterThan(selectorRow!.width * .9)
    for (const group of await editor.locator('.oscillator-control-group').all()) {
      const sliders = await boxes(group.locator('.parameter-control'))
      expect(sliders).toHaveLength(3)
      expect(Math.max(...sliders.map((box) => box.y)) - Math.min(...sliders.map((box) => box.y))).toBeLessThan(2)
      expect(Math.min(...sliders.map((box) => box.width))).toBeGreaterThanOrEqual(82)
    }
  }

  const tabletSlider = page.getByTestId('oscillator-1-level')
  const tabletControls = await page.getByTestId('oscillator-1-editor').locator('.oscillator-control-rows').boundingBox()
  await expect(page.locator('label[for="oscillator-1-level"]')).toHaveCSS('--slider-thumb-size', '12px')
  expect((await tabletSlider.boundingBox())!.height).toBeCloseTo(12, 0)
  expect(tabletControls!.width).toBeGreaterThanOrEqual(252)

  const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(viewportOverflow).toBe(0)

  const tabs = await boxes(page.getByRole('tab'))
  expect(tabs).toHaveLength(2)
  expect(Math.min(...tabs.map((box) => box.height))).toBeGreaterThanOrEqual(34)

})

test('compact layout moves the sidebar above while retaining tablet oscillator composition', async ({ page }) => {
  await openAt(page, 700)

  const stage = await page.locator('.workbench-stage').boundingBox()
  const sidebar = await page.locator('.workbench-sidebar').boundingBox()
  expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(stage!.y)

  const variantSpectra = await boxes(page.locator('.variant-spectrum'))
  expect(variantSpectra[0].y).toBe(variantSpectra[1].y)
  await expect(page.getByTestId('variant-a-spectrogram')).toHaveCSS('height', '118px')

  for (const number of [1, 2, 3]) {
    const editor = page.getByTestId(`oscillator-${number}-editor`)
    const waveform = await editor.locator('.detailed-oscillator-waveform').boundingBox()
    const position = await editor.locator('.oscillator-position-control').boundingBox()
    const controls = await editor.locator('.oscillator-control-rows').boundingBox()
    const header = await editor.locator('.detailed-oscillator-header').boundingBox()
    const selectorRow = await editor.locator('.oscillator-wavetable-row').boundingBox()
    const wavetable = await editor.getByRole('combobox', { name: 'Wavetable' }).boundingBox()
    expect(selectorRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    expect(selectorRow!.width).toBeCloseTo(header!.width, 0)
    expect(wavetable!.width).toBeGreaterThan(selectorRow!.width * .9)
    expect(position!.x + position!.width).toBeLessThanOrEqual(waveform!.x)
    expect(controls!.x).toBeGreaterThan(waveform!.x + waveform!.width)
    expect(Math.abs(controls!.y - waveform!.y)).toBeLessThan(2)
    expect(controls!.width).toBeGreaterThanOrEqual(252)
  }

  await expect(page.locator('label[for="oscillator-1-level"]')).toHaveCSS('--slider-thumb-size', '12px')
  expect((await page.getByTestId('oscillator-1-level').boundingBox())!.height).toBeCloseTo(12, 0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

test('mobile stacks the workspace and keeps the two-octave keyboard scrollable', async ({ page }) => {
  await openAt(page, 360)

  const stage = await page.locator('.workbench-stage').boundingBox()
  const sidebar = await page.locator('.workbench-sidebar').boundingBox()
  expect(stage).not.toBeNull()
  expect(sidebar).not.toBeNull()
  expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(stage!.y)
  await expect(page.getByTestId('variant-a-spectrogram')).toHaveCSS('height', '118px')
  const mobileSpectrograms = await boxes(page.locator('.variant-spectrum'))
  const mobileVariantButtons = await boxes(page.locator('.variant-comparison-card > .variant-button'))
  expect(mobileSpectrograms[0].y).toBe(mobileSpectrograms[1].y)
  expect(mobileVariantButtons[0].y).toBe(mobileVariantButtons[1].y)
  mobileSpectrograms.forEach((spectrum, index) => {
    expect(Math.abs(mobileVariantButtons[index].y + mobileVariantButtons[index].height - spectrum.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(mobileVariantButtons[index].width - spectrum.width)).toBeLessThan(1)
  })

  const viewportOverflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(viewportOverflow).toEqual({ body: 0, root: 0 })

  const oscillators = await boxes(page.locator('.detailed-oscillator-editor'))
  expect(oscillators[1].y).toBeGreaterThan(oscillators[0].y + oscillators[0].height - 1)
  expect(oscillators[2].y).toBeGreaterThan(oscillators[1].y + oscillators[1].height - 1)
  for (const number of [1, 2, 3]) {
    const editor = page.getByTestId(`oscillator-${number}-editor`)
    const waveform = await editor.locator('.detailed-oscillator-waveform').boundingBox()
    const position = await editor.locator('.oscillator-position-control').boundingBox()
    const controls = await editor.locator('.oscillator-control-rows').boundingBox()
    const header = await editor.locator('.detailed-oscillator-header').boundingBox()
    const selectorRow = await editor.locator('.oscillator-wavetable-row').boundingBox()
    const wavetable = await editor.getByRole('combobox', { name: 'Wavetable' }).boundingBox()
    expect(selectorRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    expect(selectorRow!.width).toBeCloseTo(header!.width, 0)
    expect(wavetable!.width).toBeGreaterThan(selectorRow!.width * .9)
    expect(position!.x + position!.width).toBeLessThanOrEqual(waveform!.x)
    expect(controls!.y).toBeGreaterThanOrEqual(waveform!.y + waveform!.height)
    for (const group of await editor.locator('.oscillator-control-group').all()) {
      const sliders = await boxes(group.locator('.parameter-control'))
      expect(sliders).toHaveLength(3)
      expect(Math.max(...sliders.map((box) => box.y)) - Math.min(...sliders.map((box) => box.y))).toBeLessThan(2)
    }
  }

  const modulators = await boxes(page.locator('.oscillator-modulator-row > article'))
  expect(modulators[1].y).toBeGreaterThan(modulators[0].y + modulators[0].height)

  const keyboard = page.getByTestId('keyboard-surface')
  const keyboardOverflow = await keyboard.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }))
  expect(keyboardOverflow.overflowX).toBe('auto')
  expect(keyboardOverflow.scrollWidth).toBeGreaterThan(keyboardOverflow.clientWidth)
  const keys = await boxes(keyboard.getByRole('button'))
  expect(keys).toHaveLength(25)
  expect(Math.min(...keys.map((box) => box.width))).toBeGreaterThanOrEqual(27)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const footerGap = await page.evaluate(() => {
    const footer = document.querySelector('.audition-footer')!.getBoundingClientRect()
    return document.documentElement.scrollHeight - (window.scrollY + footer.bottom)
  })
  expect(Math.abs(footerGap)).toBeLessThanOrEqual(1)
})

test('effect parity editors stay usable without horizontal overflow on mobile', async ({ page }) => {
  await openAt(page, 360)
  await page.getByRole('tab', { name: 'Effects' }).click()

  for (const effect of ['distortion', 'filter', 'chorus']) {
    const card = page.getByTestId(`effect-card-${effect}`)
    await expect(card).toBeVisible()
    expect((await card.boundingBox())!.width).toBeLessThanOrEqual(350)
  }
  await expect(page.getByTestId('distortion-enabled')).toHaveCSS('min-height', '44px')
  await expect(page.getByTestId('chorus-enabled')).toHaveCSS('min-height', '44px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
