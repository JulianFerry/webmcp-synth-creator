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

test('LFO panels omit the duplicate routing readout while retaining routing controls', async ({ page }) => {
  await openAt(page, 1160)
  const firstLfo = page.locator('.lfo-panel').first()

  await expect(firstLfo.getByTestId('lfo-1-routing-readout')).toHaveCount(0)
  await expect(firstLfo.getByRole('slider', { name: 'Depth' })).toBeVisible()
  await expect(firstLfo.getByRole('combobox', { name: 'Target' })).toBeVisible()
  await expect(firstLfo.getByRole('combobox', { name: 'Scope' })).toBeVisible()
  await expect(firstLfo.getByRole('slider', { name: 'Phase' })).toHaveAttribute('aria-valuetext', /^\d+°$/)
  for (const controlId of ['oscillator-1-level', 'amp-attack', 'lfo-1-depth']) {
    await expect(page.locator(`label[for="${controlId}"] > span`).first()).toHaveCSS('color', 'rgb(152, 169, 188)')
  }
})

test('sidebar labels match synthesis controls and preset selection precedes transfer actions', async ({ page }) => {
  await openAt(page, 1160)
  const headings = page.locator('.sidebar-section-heading > span')
  await expect(headings).toHaveText(['Preset', 'A/B compare'])
  for (const heading of await headings.all()) {
    await expect(heading).toHaveCSS('color', 'rgb(152, 169, 188)')
    await expect(heading).toHaveCSS('font-size', '8px')
  }
  const actions = await page.locator('.sidebar-transfer-actions').boundingBox()
  const preset = await page.locator('.sidebar-preset-row').boundingBox()
  expect(preset!.y + preset!.height).toBeLessThanOrEqual(actions!.y)
})

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
  expect(sidebar!.width).toBeCloseTo(235, 0)
  expect(footer!.width).toBeGreaterThan(stage!.width)
  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveCount(0)

  const panels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(panels).toHaveLength(6)
  expect(panels[0].y).toBeCloseTo(panels[1].y, 0)
  expect(panels[2].y).toBeCloseTo(panels[3].y, 0)
  expect(panels[4].y).toBeCloseTo(panels[5].y, 0)
  expect(panels[2].y).toBeGreaterThan(panels[0].y + panels[0].height - 1)
  expect(panels[4].y).toBeGreaterThan(panels[2].y + panels[2].height - 1)
  await expect(page.locator('.oscillators-workspace > .lfo-panel h2')).toHaveText(['LFO 1', 'LFO 2'])
  await expect(page.getByTestId('amp-hold-handle')).toHaveCount(0)
  const synthesisControls = await boxes(page.locator([
    '.oscillators-workspace > article .oscillator-control-group > label',
    '.oscillators-workspace > .envelope-panel .envelope-controls > label',
    '.oscillators-workspace > .lfo-panel .lfo-controls > label',
  ].join(', ')))
  expect(Math.min(...synthesisControls.map((box) => box.width))).toBeGreaterThanOrEqual(91)

  const variantButtons = await boxes(page.locator('.variant-comparison-card > .variant-button'))
  const spectrograms = await boxes(page.locator('.variant-spectrum'))
  expect(variantButtons).toHaveLength(2)
  expect(spectrograms).toHaveLength(2)
  expect(spectrograms[1].y).toBeGreaterThan(spectrograms[0].y + spectrograms[0].height)
  expect(Math.abs(variantButtons[0].y + variantButtons[0].height - spectrograms[0].y)).toBeLessThanOrEqual(2)
  expect(Math.abs(variantButtons[1].y + variantButtons[1].height - spectrograms[1].y)).toBeLessThanOrEqual(2)
  await expect(page.locator('.attribute-bars')).toHaveCount(0)
  const variantActionRows = await boxes(page.locator('.variant-card-actions'))
  expect(variantActionRows).toHaveLength(2)
  for (const actions of await page.locator('.variant-card-actions').all()) {
    const buttons = await boxes(actions.locator('button'))
    expect(buttons[0].y).toBeCloseTo(buttons[1].y, 0)
  }
  await expect(page.getByTestId('variant-a-spectrogram')).toHaveAttribute('data-color', '#27b3c2')
  await expect(page.getByTestId('variant-b-spectrogram')).toHaveAttribute('data-color', '#8261c8')
  const spectrogramWidths = await page.locator('.variant-spectrum-a').evaluate((window) => ({
    canvas: window.querySelector('canvas')!.getBoundingClientRect().width,
    window: (window as HTMLElement).clientWidth,
  }))
  expect(spectrogramWidths.canvas).toBeCloseTo(spectrogramWidths.window - 5, 0)
  await expect(page.locator('.sidebar-title')).toHaveText('SYNTH CREATOR')
  const sidebarHeadings = page.locator('.sidebar-section-heading > span')
  await expect(sidebarHeadings).toHaveText(['Preset', 'A/B compare'])
  for (const heading of await sidebarHeadings.all()) {
    await expect(heading).toHaveCSS('color', 'rgb(152, 169, 188)')
    await expect(heading).toHaveCSS('font-size', '8px')
  }
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

  const firstLfo = page.locator('.lfo-panel').first()
  const lfoControlLabels = await firstLfo.locator('.lfo-controls > label > span:first-child').allTextContents()
  expect(lfoControlLabels).toEqual(['Depth', 'Target', 'Scope', 'Division', 'Shape mode', 'Phase'])
  await expect(firstLfo.getByRole('slider', { name: 'Division' })).toBeVisible()
  await expect(firstLfo.getByRole('combobox', { name: 'Division' })).toHaveCount(0)
  await expect(firstLfo.getByRole('slider', { name: 'Division' })).not.toHaveAttribute('aria-valuetext', /T|triplet/i)

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

test('available width chooses three, two, then one oscillator workspace columns', async ({ page }) => {
  await openAt(page, 1270)
  const desktopSidebar = await page.locator('.workbench-sidebar').boundingBox()
  const desktopPanels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(desktopPanels[0].y).toBeCloseTo(desktopPanels[1].y, 0)
  expect(desktopPanels[1].y).toBeCloseTo(desktopPanels[2].y, 0)
  const desktopSliders = await boxes(page.locator('.oscillator-control-group > .parameter-control'))
  expect(Math.min(...desktopSliders.map((box) => box.width))).toBeGreaterThanOrEqual(91)

  await openAt(page, 883)
  const minimumWidthSidebar = await page.locator('.workbench-sidebar').boundingBox()
  const minimumWidthStage = await page.locator('.workbench-stage').boundingBox()
  expect(minimumWidthSidebar!.x + minimumWidthSidebar!.width).toBeLessThanOrEqual(minimumWidthStage!.x)
  const minimumWidthSliders = await boxes(page.locator('.oscillator-control-group > .parameter-control'))
  expect(Math.min(...minimumWidthSliders.map((box) => box.width))).toBeCloseTo(91, 0)

  await openAt(page, 882)
  const stackedSidebar = await page.locator('.workbench-sidebar').boundingBox()
  const stackedStage = await page.locator('.workbench-stage').boundingBox()
  expect(stackedSidebar!.y + stackedSidebar!.height).toBeLessThanOrEqual(stackedStage!.y)

  await openAt(page, 1120)
  const tabletSidebar = await page.locator('.workbench-sidebar').boundingBox()
  expect(tabletSidebar!.width).toBeCloseTo(235, 0)
  expect(tabletSidebar!.width).toBeCloseTo(desktopSidebar!.width, 0)

  const tabletPanels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(tabletPanels).toHaveLength(6)
  expect(tabletPanels[0].y).toBeCloseTo(tabletPanels[1].y, 0)
  expect(tabletPanels[2].y).toBeCloseTo(tabletPanels[3].y, 0)
  expect(tabletPanels[4].y).toBeCloseTo(tabletPanels[5].y, 0)
  expect(tabletPanels[2].y).toBeGreaterThan(tabletPanels[0].y + tabletPanels[0].height - 1)
  expect(tabletPanels[4].y).toBeGreaterThan(tabletPanels[2].y + tabletPanels[2].height - 1)

  await openAt(page, 700)
  const stage = await page.locator('.workbench-stage').boundingBox()
  const sidebar = await page.locator('.workbench-sidebar').boundingBox()
  expect(stage).not.toBeNull()
  expect(sidebar).not.toBeNull()
  expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(stage!.y)
  await expect(page.locator('.workbench-sidebar')).toHaveCSS('padding', '10px')

  const compactSpectrograms = await boxes(page.locator('.variant-spectrum'))
  expect(compactSpectrograms[0].y).toBeCloseTo(compactSpectrograms[1].y, 0)
  const presetRow = await page.locator('.sidebar-preset-row').boundingBox()
  const transferActions = await page.locator('.sidebar-transfer-actions').boundingBox()
  expect(presetRow!.y + presetRow!.height).toBeLessThanOrEqual(transferActions!.y)

  const compactPanels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(compactPanels[0].y).toBeCloseTo(compactPanels[1].y, 0)
  expect(compactPanels[2].y).toBeCloseTo(compactPanels[3].y, 0)
  expect(compactPanels[4].y).toBeCloseTo(compactPanels[5].y, 0)

  const oscillators = await boxes(page.locator('.detailed-oscillator-editor'))
  expect(oscillators[0].y).toBeCloseTo(oscillators[1].y, 0)
  expect(oscillators[2].y).toBeGreaterThan(oscillators[1].y + oscillators[1].height - 1)
  for (const number of [1, 2, 3]) {
    const editor = page.getByTestId(`oscillator-${number}-editor`)
    const waveform = await editor.locator('.detailed-oscillator-waveform').boundingBox()
    const controls = await editor.locator('.oscillator-control-rows').boundingBox()
    const selectorRow = await editor.locator('.oscillator-wavetable-row').boundingBox()
    const wavetable = await editor.getByRole('combobox', { name: 'Wavetable' }).boundingBox()
    const header = await editor.locator('.detailed-oscillator-header').boundingBox()
    expect(controls!.y).toBeGreaterThanOrEqual(waveform!.y + waveform!.height)
    expect(selectorRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    expect(selectorRow!.width).toBeCloseTo(header!.width, 0)
    expect(wavetable!.width).toBeGreaterThan(selectorRow!.width * .9)
    for (const group of await editor.locator('.oscillator-control-group').all()) {
      const sliders = await boxes(group.locator('.parameter-control'))
      expect(sliders).toHaveLength(3)
      expect(Math.max(...sliders.map((box) => box.y)) - Math.min(...sliders.map((box) => box.y))).toBeLessThan(2)
      expect(Math.min(...sliders.map((box) => box.width))).toBeGreaterThanOrEqual(91)
    }
  }

  const compactSlider = page.getByTestId('oscillator-1-level')
  await expect(page.locator('label[for="oscillator-1-level"]')).toHaveCSS('--slider-thumb-size', '12px')
  expect((await compactSlider.boundingBox())!.height).toBeCloseTo(12, 0)

  const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(viewportOverflow).toBe(0)

  const tabs = await boxes(page.getByRole('tab'))
  expect(tabs).toHaveLength(2)
  expect(Math.min(...tabs.map((box) => box.height))).toBeGreaterThanOrEqual(34)

  await openAt(page, 590)
  const narrowPanels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(narrowPanels).toHaveLength(6)
  for (let index = 1; index < narrowPanels.length; index += 1) {
    expect(narrowPanels[index].y).toBeGreaterThan(narrowPanels[index - 1].y + narrowPanels[index - 1].height - 1)
  }
  const narrowKeyboard = await page.locator('.audition-footer .keyboard-column').boundingBox()
  const narrowPreview = await page.locator('.audition-footer .footer-preview-controls').boundingBox()
  expect(narrowKeyboard!.y + narrowKeyboard!.height).toBeLessThanOrEqual(narrowPreview!.y)
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

  const workspacePanels = await boxes(page.locator('.oscillators-workspace > article'))
  expect(workspacePanels).toHaveLength(6)
  for (let index = 1; index < workspacePanels.length; index += 1) {
    expect(workspacePanels[index].y).toBeGreaterThan(workspacePanels[index - 1].y + workspacePanels[index - 1].height - 1)
  }
  const mobileSynthesisControls = await boxes(page.locator([
    '.oscillators-workspace > article .oscillator-control-group > label',
    '.oscillators-workspace > .envelope-panel .envelope-controls > label',
    '.oscillators-workspace > .lfo-panel .lfo-controls > label',
  ].join(', ')))
  expect(Math.min(...mobileSynthesisControls.map((box) => box.width))).toBeGreaterThanOrEqual(91)

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

test('mobile effect drag handles stay underneath the sticky audition footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  const overlap = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>('.audition-footer')!
    const handles = [...document.querySelectorAll<HTMLElement>('.fx-module-drag-handle')]
    const footerBounds = footer.getBoundingClientRect()
    const handle = handles.find((candidate) => candidate.getBoundingClientRect().bottom > footerBounds.top)
    if (!handle) return null
    const handleBounds = handle.getBoundingClientRect()
    const element = document.elementFromPoint(
      handleBounds.left + handleBounds.width / 2,
      footerBounds.top + 4,
    )
    return element?.closest('.audition-footer') === footer
  })

  expect(overlap).toBe(true)
})
