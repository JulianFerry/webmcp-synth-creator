import { expect, test } from '@playwright/test'

test('oscillators default to 3D and toggle locally with full, matched stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  const editor = page.getByTestId('oscillator-1-editor')
  const mode2d = editor.getByRole('button', { name: '2D' })
  const mode3d = editor.getByRole('button', { name: '3D' })
  await expect(mode3d).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('oscillator-1-waterfall')).toHaveAccessibleName(/projected diagonally right/i)
  const stage3d = await editor.locator('.detailed-oscillator-waveform').boundingBox()
  const waterfall3d = await page.getByTestId('oscillator-1-waterfall').boundingBox()
  const waterfallInset = await page.getByTestId('oscillator-1-waterfall').getAttribute('data-visible-plot-inset-percent')
  const waterfallBounds = await page.getByTestId('oscillator-1-waterfall').evaluate((element) => ({
    left: Number((element as HTMLElement).dataset.plotLeft),
    right: Number((element as HTMLElement).dataset.plotRight),
  }))

  await mode2d.click()
  await expect(mode2d).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('oscillator-1-waveform')).toBeVisible()
  const stage2d = await editor.locator('.detailed-oscillator-waveform').boundingBox()
  const waveform2d = await page.getByTestId('oscillator-1-waveform').boundingBox()
  expect(stage2d).toMatchObject({ x: stage3d!.x, y: stage3d!.y, width: stage3d!.width, height: stage3d!.height })
  expect(Math.abs((waveform2d!.x + waveform2d!.width / 2) - (stage2d!.x + stage2d!.width / 2))).toBeLessThan(2)
  expect(Math.abs((waterfall3d!.x + waterfall3d!.width / 2) - (stage3d!.x + stage3d!.width / 2))).toBeLessThan(2)

  const position = page.getByTestId('oscillator-1-position')
  const level = page.getByTestId('oscillator-1-level')
  const visualization = await editor.locator('.oscillator-visualization').boundingBox()
  const positionBox = await position.boundingBox()
  const levelBox = await level.boundingBox()
  expect(visualization).not.toBeNull()
  expect(positionBox!.x + positionBox!.width).toBeLessThanOrEqual(stage2d!.x)
  expect(positionBox!.y).toBeGreaterThanOrEqual(visualization!.y)
  await expect(position).toHaveAttribute('aria-orientation', 'vertical')
  expect(levelBox!.y).toBeGreaterThan(visualization!.y + visualization!.height)
  await expect(editor.locator('label[for="oscillator-1-level"]')).toHaveClass(/parameter-control-slider/)
  await expect(editor.locator('.parameter-knob-dial')).toHaveCount(0)
  await expect(editor).not.toContainText('Spectral source')
  await expect(editor.getByRole('combobox', { name: 'Wavetable' })).toBeVisible()
  await expect(page.getByTestId('oscillator-1-spread')).toHaveCount(0)
  const waveformBounds = await page.getByTestId('oscillator-1-waveform').locator('.waveform-line').evaluate((path: SVGGraphicsElement) => {
    const bounds = path.getBoundingClientRect()
    const svg = path.ownerSVGElement!.getBoundingClientRect()
    return { left: bounds.left - svg.left, right: bounds.right - svg.left }
  })
  expect(waterfallBounds.left).toBeCloseTo(waveformBounds.left, 0)
  expect(waterfallBounds.right).toBeCloseTo(waveformBounds.right, 0)
  const plotInsets = [waterfallInset, await page.getByTestId('oscillator-1-waveform').getAttribute('data-plot-inset-percent')]
  expect(plotInsets).toEqual(['2', '2'])
  const caption = await editor.locator('.oscillator-waveform-toolbar > small').boundingBox()
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(waveform2d!.y + 1)

  const beforeHistory = Number(await page.getByTestId('history-size').textContent())
  await position.focus()
  await position.press('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText(String(beforeHistory + 1))

  const source = page.getByTestId('oscillator-1-wavetable')
  const options = await source.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ label: node.textContent ?? '', value: (node as HTMLOptionElement).value })))
  const staticOption = options.find((option) => /sine/i.test(option.label)) ?? options[0]
  await source.selectOption(staticOption.value)
  await expect(position).toBeDisabled()
  await expect(position).toHaveAccessibleDescription(/one static frame/i)

  await expect(page.getByTestId('oscillator-3-editor')).toHaveClass(/is-disabled/)

  const headerItems = await Promise.all([
    editor.getByRole('heading', { name: 'Oscillator 1' }).boundingBox(),
    page.getByTestId('oscillator-1-enabled').boundingBox(),
  ])
  expect(headerItems[0]!.x).toBeLessThan(headerItems[1]!.x)
  const header = await editor.locator('.detailed-oscillator-header').boundingBox()
  const selectorRow = await editor.locator('.oscillator-wavetable-row').boundingBox()
  const selector = await editor.getByRole('combobox', { name: 'Wavetable' }).boundingBox()
  expect(selectorRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
  expect(selectorRow!.width).toBeCloseTo(header!.width, 0)
  expect(selector!.width).toBeGreaterThan(selectorRow!.width * .9)
  const positionColumn = await editor.locator('.oscillator-position-control').boundingBox()
  const positionVisual = editor.getByTestId('oscillator-1-position-visual')
  const visualBox = await positionVisual.boundingBox()
  const thumbBoxes = []
  for (const value of [0, 0.5, 1]) {
    await position.evaluate((input: HTMLInputElement, next) => {
      input.value = String(next)
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, value)
    const thumb = await positionVisual.locator('i').boundingBox()
    thumbBoxes.push(thumb!)
  }
  const columnCenter = positionColumn!.x + positionColumn!.width / 2
  expect(Math.abs((positionBox!.x + positionBox!.width / 2) - columnCenter)).toBeLessThan(.5)
  expect(Math.abs((visualBox!.x + visualBox!.width / 2) - columnCenter)).toBeLessThan(.5)
  for (const thumb of thumbBoxes) {
    expect(Math.abs((thumb.x + thumb.width / 2) - columnCenter)).toBeLessThan(.5)
    expect(thumb.x).toBeGreaterThanOrEqual(visualBox!.x)
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(visualBox!.x + visualBox!.width)
    expect(thumb.x).toBeGreaterThanOrEqual(positionColumn!.x)
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(positionColumn!.x + positionColumn!.width)
  }
  expect(positionBox!.width).toBeCloseTo(12, 0)
  const trackTokens = await Promise.all([
    editor.locator('label[for="oscillator-1-position"]').evaluate((element) => getComputedStyle(element).getPropertyValue('--slider-track-thickness')),
    editor.locator('label[for="oscillator-1-level"]').evaluate((element) => getComputedStyle(element).getPropertyValue('--slider-track-thickness')),
  ])
  expect(trackTokens).toEqual(['3px', '3px'])
})

test('oscillator mix and voicing sliders reset to an undoable midpoint on double-click', async ({ page }) => {
  await page.goto('/')

  const midpointValues = {
    level: '0.5',
    transpose: '0',
    fine: '0',
    unison: '5',
    detune: '0.5',
    'random-phase': '0.5',
  }

  for (const [control, midpoint] of Object.entries(midpointValues)) {
    const slider = page.getByTestId(`oscillator-2-${control}`)
    const bounds = await slider.boundingBox()
    const position = Number(await slider.getAttribute('data-scale-position'))
    expect(bounds).not.toBeNull()
    await slider.dblclick({
      position: {
        x: 6 + position * (bounds!.width - 12),
        y: bounds!.height / 2,
      },
    })
    await expect(slider).toHaveValue(midpoint)
  }

  await expect(page.getByTestId('history-size')).toHaveText('6')
  await expect(page.getByTestId('latest-diff')).toContainText('oscillators.1.randomPhase')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByTestId('oscillator-2-random-phase')).toHaveValue('0')
  await expect(page.getByTestId('history-size')).toHaveText('5')
})
