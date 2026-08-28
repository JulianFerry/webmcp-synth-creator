import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test('top patch controls stay synchronized and Vital import is one undoable B-local transaction', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const presetSelector = page.getByTestId('preset-selector')
  await expect(presetSelector).toHaveValue('ethereal-gate')

  await presetSelector.selectOption('glass-pluck')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')

  await page.getByRole('button', { name: 'Make darker' }).click()
  await expect(presetSelector).toHaveValue('')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(presetSelector).toHaveValue('glass-pluck')
  await page.getByRole('button', { name: 'Redo transaction' }).click()
  await expect(presetSelector).toHaveValue('')

  await presetSelector.selectOption('wide-lead')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exportedBuffer = await readFile(downloadPath as string)

  await presetSelector.selectOption('glass-pluck')
  await expect(page.getByTestId('history-size')).toHaveText('4')
  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'wide-lead.vital',
    mimeType: 'application/json',
    buffer: exportedBuffer,
  })

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wide Lead')
  await expect(presetSelector).toHaveValue('')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '5400')
  await expect(page.getByTestId('history-size')).toHaveText('5')
  await expect(page.getByTestId('vital-import-notice')).toContainText(
    'tags or modulation route IDs',
  )
  await expect(page.getByTestId('export-filename')).toHaveText('wide-lead.vital')

  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '9200')

  await page.getByTestId('create-variant-b').click()
  await expect(page.getByTestId('current-variant')).toHaveText('B')
  await expect(presetSelector).toHaveValue('')
  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'wide-lead.vital',
    mimeType: 'application/json',
    buffer: exportedBuffer,
  })
  await expect(page.getByTestId('history-size')).toHaveText('2')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wide Lead')

  await page.getByTestId('variant-a').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')
  await page.getByTestId('variant-b').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wide Lead')
  await expect(presetSelector).toHaveValue('')

  const stateBeforeInvalidImport = await page.evaluate(() => {
    const audio = document.querySelector('[data-testid="audio-adapter-state"]')
    return {
      title: document.querySelector('h1')?.textContent,
      cutoff: audio?.getAttribute('data-cutoff'),
      history: document.querySelector('[data-testid="history-size"]')?.textContent,
      transactions: document.querySelector('[data-testid="transaction-count"]')?.textContent,
      filename: document.querySelector('[data-testid="export-filename"]')?.textContent,
    }
  })

  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'broken.vital',
    mimeType: 'application/json',
    buffer: Buffer.from('{"preset_name":'),
  })
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  expect(
    await page.evaluate(() => {
      const audio = document.querySelector('[data-testid="audio-adapter-state"]')
      return {
        title: document.querySelector('h1')?.textContent,
        cutoff: audio?.getAttribute('data-cutoff'),
        history: document.querySelector('[data-testid="history-size"]')?.textContent,
        transactions: document.querySelector('[data-testid="transaction-count"]')?.textContent,
        filename: document.querySelector('[data-testid="export-filename"]')?.textContent,
      }
    }),
  ).toEqual(stateBeforeInvalidImport)
})

test('responsive top patch controls expose keyboard and screen-reader semantics', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const selector = page.getByRole('combobox', { name: 'Curated patch' })
  const importButton = page.getByRole('button', { name: 'Import Vital' })
  const exportButton = page.getByRole('button', { name: 'Export Vital' })
  await expect(selector).toBeVisible()
  await expect(importButton).toBeVisible()
  await expect(exportButton).toBeVisible()
  await expect(selector.locator('option')).toHaveCount(7)
  await expect(page.getByTestId('import-vital-input')).toHaveAttribute(
    'accept',
    '.vital,application/json',
  )

  await selector.selectOption('midnight-pad')
  await expect(selector).toHaveValue('midnight-pad')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Midnight Pad')
  await selector.focus()
  await page.keyboard.press('Tab')
  await expect(importButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(exportButton).toBeFocused()

  const layout = await page.evaluate(() => {
    const importRect = document.querySelector('[data-testid="import-vital"]')!.getBoundingClientRect()
    const exportRect = document.querySelector('[data-testid="export-vital"]')!.getBoundingClientRect()
    const actionsRect = document.querySelector('.masthead-actions')!.getBoundingClientRect()
    return {
      noHorizontalOverflow:
        getComputedStyle(document.body).overflowX === 'hidden' &&
        actionsRect.left >= 0 &&
        actionsRect.right <= window.innerWidth,
      actionsShareRow: Math.abs(importRect.top - exportRect.top) < 2,
    }
  })
  expect(layout).toEqual({ noHorizontalOverflow: true, actionsShareRow: true })
})
