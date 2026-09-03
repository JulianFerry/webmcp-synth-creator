import { expect, test } from '@playwright/test'

test('component help selects controls without editing, then keeps the focused control usable', async ({ page }) => {
  await page.goto('/')

  const actions = page.locator('.workbench-tab-actions')
  await expect(actions.getByRole('button')).toHaveCount(4)
  await expect(actions.getByRole('button').nth(0)).toHaveAccessibleName('Undo transaction')
  await expect(actions.getByRole('button').nth(1)).toHaveAccessibleName('Redo transaction')
  await expect(actions.getByRole('button').nth(2)).toHaveAccessibleName('Explain a component')
  await expect(actions.getByRole('button').nth(3)).toHaveText(/Getting started/)

  await page.getByTestId('help-select-button').click()
  await expect(page.getByTestId('help-picker-banner')).toContainText('Select anything')

  const oscillator = page.getByTestId('oscillator-1-editor')
  await oscillator.getByRole('heading', { name: 'Oscillator 1' }).hover()
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Oscillator 1')
  await oscillator.getByRole('heading', { name: 'Oscillator 1' }).click()

  const oscillatorHelp = page.getByRole('dialog', { name: 'Oscillator 1' })
  await expect(oscillatorHelp).toBeVisible()
  await expect(oscillatorHelp).toContainText('Generates one layer of the patch')
  await oscillatorHelp.getByRole('button', { name: 'Select another' }).click()

  const level = page.getByTestId('oscillator-1-level')
  const levelBeforeSelection = await level.inputValue()
  await level.hover()
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Level control')
  const levelBounds = await level.boundingBox()
  expect(levelBounds).not.toBeNull()
  await page.mouse.click(levelBounds!.x + levelBounds!.width - 2, levelBounds!.y + levelBounds!.height / 2)
  await expect(level).toHaveValue(levelBeforeSelection)
  const levelHelp = page.getByRole('dialog', { name: 'Level control' })
  await expect(levelHelp).toContainText('Controls how loudly this oscillator contributes')
  await level.focus()
  await level.press('ArrowRight')
  await expect(level).not.toHaveValue(levelBeforeSelection)
  await levelHelp.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByTestId('help-picker-banner')).toHaveCount(0)
})

test('component help combines nested elements that resolve to the same explanation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()
  await page.getByTestId('help-select-button').click()

  const module = page.getByTestId('effect-card-distortion')
  const nestedPanel = module.locator('.processor-slot')
  const effectThumb = module.locator('.fx-drag-grip')
  await effectThumb.hover()

  const moduleBounds = await module.boundingBox()
  const panelBounds = await nestedPanel.boundingBox()
  const highlightBounds = await page.getByTestId('help-target-box').boundingBox()
  expect(moduleBounds).not.toBeNull()
  expect(panelBounds).not.toBeNull()
  expect(highlightBounds).not.toBeNull()
  expect(moduleBounds!.width).toBeGreaterThan(panelBounds!.width)
  expect(highlightBounds!.width).toBeCloseTo(moduleBounds!.width + 8, 0)
  expect(highlightBounds!.height).toBeCloseTo(moduleBounds!.height + 8, 0)
  await effectThumb.click()
  const effectHelp = page.getByRole('dialog', { name: 'Distortion' })
  await expect(effectHelp).toContainText('Adds new harmonics')
  await expect(effectHelp).not.toContainText(/arrow/i)
  await effectHelp.getByRole('button', { name: 'Select another' }).click()

  await page.getByTestId('filter-type').click()
  const modeHelp = page.getByRole('dialog', { name: 'Filter shape' })
  await expect(modeHelp).toContainText('Low-pass keeps the low frequencies')
  await modeHelp.getByRole('button', { name: 'Select another' }).click()

  await page.getByTestId('reverb-mix').click()
  const reverbAmountHelp = page.getByRole('dialog', { name: 'Reverb amount' })
  await expect(reverbAmountHelp).toContainText('At 0% the patch stays dry and close')
})

test('variant cards, titled dropdowns, and the keyboard each use one combined help target', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('help-select-button').click()

  const variantCard = page.locator('.variant-comparison-card-a')
  const variantCardBounds = await variantCard.boundingBox()
  expect(variantCardBounds).not.toBeNull()
  let variantHighlight: Awaited<ReturnType<typeof variantCard.boundingBox>> = null
  for (const target of [page.getByTestId('variant-a'), page.getByTestId('variant-a-spectrogram')]) {
    await target.hover()
    await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Variant A')
    await page.waitForTimeout(100)
    const highlight = await page.getByTestId('help-target-box').boundingBox()
    expect(highlight).not.toBeNull()
    expect(highlight!.width).toBeGreaterThanOrEqual(variantCardBounds!.width)
    expect(highlight!.height).toBeGreaterThanOrEqual(variantCardBounds!.height)
    if (variantHighlight) {
      expect(highlight!.x).toBeCloseTo(variantHighlight.x, 0)
      expect(highlight!.y).toBeCloseTo(variantHighlight.y, 0)
      expect(highlight!.width).toBeCloseTo(variantHighlight.width, 0)
      expect(highlight!.height).toBeCloseTo(variantHighlight.height, 0)
    }
    variantHighlight = highlight
  }

  const wavetableControl = page.locator('label[for="oscillator-1-wavetable"]')
  let titledDropdownHighlight: Awaited<ReturnType<typeof wavetableControl.boundingBox>> = null
  for (const target of [wavetableControl.getByText('Wavetable', { exact: true }), page.getByTestId('oscillator-1-wavetable')]) {
    await target.hover()
    await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Wavetable control')
    await page.waitForTimeout(100)
    const highlight = await page.getByTestId('help-target-box').boundingBox()
    expect(highlight).not.toBeNull()
    if (titledDropdownHighlight) {
      expect(highlight!.x).toBeCloseTo(titledDropdownHighlight.x, 0)
      expect(highlight!.y).toBeCloseTo(titledDropdownHighlight.y, 0)
      expect(highlight!.width).toBeCloseTo(titledDropdownHighlight.width, 0)
      expect(highlight!.height).toBeCloseTo(titledDropdownHighlight.height, 0)
    }
    titledDropdownHighlight = highlight
  }

  const keyboard = page.getByTestId('keyboard-surface')
  const keyboardBounds = await keyboard.boundingBox()
  await page.getByTestId('note-48').hover()
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Two-octave keyboard')
  await page.waitForTimeout(100)
  const keyboardHighlight = await page.getByTestId('help-target-box').boundingBox()
  expect(keyboardBounds).not.toBeNull()
  expect(keyboardHighlight).not.toBeNull()
  expect(keyboardHighlight!.width).toBeGreaterThanOrEqual(keyboardBounds!.width)
  expect(keyboardHighlight!.height).toBeGreaterThanOrEqual(keyboardBounds!.height)
  await page.getByTestId('note-48').click()
  const keyboardHelp = page.getByRole('dialog', { name: 'Two-octave keyboard' })
  await expect(keyboardHelp).toContainText('Z-M for the lower octave and Q-I for the upper octave')
  await expect(page.getByRole('dialog', { name: 'Permanent keyboard' })).toHaveCount(0)
})

test('broad workbench containers do not offer generic help', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('help-select-button').click()

  await page.locator('.sidebar-title').hover()
  await expect(page.getByTestId('help-target-box')).toHaveCount(0)

  const stage = await page.locator('.workbench-stage').boundingBox()
  expect(stage).not.toBeNull()
  await page.mouse.move(stage!.x + stage!.width - 2, stage!.y + 2)
  await expect(page.getByTestId('help-target-box')).toHaveCount(0)
})

test('Just play guide highlights the preview, keyboard, presets, and variants', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('getting-started-button').click()

  const choice = page.getByRole('dialog', { name: 'Getting started' })
  await expect(choice.locator('h2, .help-choice-intro, .help-route-kicker')).toHaveText([
    'Getting started',
    'Take a short, highlighted tour. Nothing in your patch changes while the guide is running.',
    'Choose your route',
  ])
  await expect(choice).not.toContainText('Workbench orientation')
  await expect(choice.getByRole('button', { name: /Just play/ })).toBeVisible()
  await expect(choice.getByRole('button', { name: /Create synth/ })).toBeVisible()
  await choice.getByRole('button', { name: /Just play/ }).click()

  const step = page.getByTestId('guide-step')
  await expect(step.getByRole('heading')).toHaveText('Hear the patch immediately')
  await expect(step).not.toContainText('Just play / 01')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Hear the patch immediately')
  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')

  await page.keyboard.press('Enter')
  await expect(step.getByRole('heading')).toHaveText('Play the two-octave keyboard')
  await page.keyboard.press('ArrowRight')
  await expect(step.getByRole('heading')).toHaveText('Try a different starting patch')
  await page.keyboard.press('ArrowLeft')
  await expect(step.getByRole('heading')).toHaveText('Play the two-octave keyboard')
  await page.keyboard.press('ArrowRight')
  await expect(step.getByRole('heading')).toHaveText('Try a different starting patch')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Compare A and B')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Ask what anything does')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Ask what anything does')
  await step.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('dialog', { name: 'You are ready to make some noise.' })).toBeVisible()
})

test('Create synth guide switches workspaces and reaches Vital export', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('getting-started-button').click()
  await page.getByTestId('guide-create-synth').click()

  const step = page.getByTestId('guide-step')
  await expect(step.getByRole('heading')).toHaveText('Choose a foundation')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Build the tone at the oscillator')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Shape the note over time')
  await step.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('tab', { name: /Oscillators/ })).toHaveAttribute('aria-selected', 'true')
  await expect(step.getByRole('heading')).toHaveText('Add repeating movement with the Low Frequency Oscillator')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Add repeating movement with the Low Frequency Oscillator')
  await expect(step.locator('.help-tip')).toContainText('not another audible oscillator')
  await step.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('tab', { name: 'Effects' })).toHaveAttribute('aria-selected', 'true')
  await expect(step.getByRole('heading')).toHaveText('Color the signal with effects')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Color the signal with effects')

  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Step backward or forward through edits')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Step backward or forward through edits')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Keep an alternative')
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Export the finished instrument')
  await expect(page.getByTestId('export-vital')).toBeVisible()
  await step.getByRole('button', { name: 'Next' }).click()
  await expect(step.getByRole('heading')).toHaveText('Get help while you build')
  await expect(page.getByTestId('help-target-box')).toHaveAttribute('data-help-target', 'Get help while you build')
})

test('help windows and oscillator group labels follow the selected patch color', async ({ page }) => {
  await page.goto('/')
  const legend = page.locator('.oscillator-control-group legend').first()
  await expect(legend).toHaveCSS('color', 'rgb(39, 179, 194)')

  await page.getByTestId('getting-started-button').click()
  const choice = page.getByRole('dialog', { name: 'Getting started' })
  const variantAWindowColor = await choice.evaluate((element) => getComputedStyle(element).borderColor)
  await choice.getByRole('button', { name: /Just play/ }).click()
  await expect(page.getByTestId('guide-step').locator('.help-tip')).toHaveCSS('border-left-color', 'rgb(255, 159, 74)')
  await page.getByTestId('guide-step').getByRole('button', { name: 'Close help' }).click()

  await page.getByTestId('variant-b').click()
  await expect(legend).toHaveCSS('color', 'rgb(126, 90, 199)')
  await page.getByTestId('getting-started-button').click()
  const variantBWindowColor = await page.getByRole('dialog', { name: 'Getting started' }).evaluate((element) => getComputedStyle(element).borderColor)
  expect(variantBWindowColor).not.toBe(variantAWindowColor)
})

test('help choices and guide cards stay inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await page.getByTestId('getting-started-button').click()

  const choice = page.getByRole('dialog', { name: 'Getting started' })
  const justPlay = await page.getByTestId('guide-just-play').boundingBox()
  const createSynth = await page.getByTestId('guide-create-synth').boundingBox()
  expect(justPlay).not.toBeNull()
  expect(createSynth).not.toBeNull()
  expect(createSynth!.y).toBeGreaterThan(justPlay!.y + justPlay!.height - 1)

  await choice.getByRole('button', { name: /Just play/ }).click()
  const guide = await page.getByTestId('guide-step').boundingBox()
  expect(guide).not.toBeNull()
  expect(guide!.x).toBeGreaterThanOrEqual(0)
  expect(guide!.x + guide!.width).toBeLessThanOrEqual(360)
  expect(guide!.y).toBeGreaterThanOrEqual(0)
  expect(guide!.y + guide!.height).toBeLessThanOrEqual(740)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
