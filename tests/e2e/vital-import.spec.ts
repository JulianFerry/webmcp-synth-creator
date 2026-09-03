import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

async function installWebMcpDouble(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Tool = {
      name: string
      description: string
      inputSchema: Record<string, unknown>
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
      execute: (input: Record<string, unknown>, context: { signal: AbortSignal }) => Promise<unknown>
    }
    const tools = new Map<string, Tool>()
    const context = {
      async registerTool(tool: Tool, options: { signal?: AbortSignal } = {}) {
        tools.set(tool.name, tool)
        options.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
      async getTools() {
        return [...tools.values()].map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        }))
      },
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

test('top patch controls stay synchronized and Vital import is one undoable B-local transaction', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('vital-status')).toContainText('ready')
  await expect(page.locator('.diagnostic-drawer')).toHaveCount(0)
  await expect(page.getByTestId('telemetry-region')).toBeAttached()

  const presetSelector = page.getByTestId('preset-selector')
  await expect(presetSelector).toHaveValue('ethereal-gate')

  await presetSelector.selectOption('glass-pluck')
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')

  await page.locator('.darken-control').evaluate((button: HTMLButtonElement) => button.click())
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

  const toolDownloadPromise = page.waitForEvent('download')
  const toolExport = await page.evaluate(async () => {
    const tool = (await document.modelContext!.getTools()).find(({ name }) => name === 'export_patch')
    if (!tool) throw new Error('export_patch was not registered')
    return JSON.parse(await document.modelContext!.executeTool(tool, { filename: 'tool-wide-lead' })) as {
      filename: string
      validation: { valid: boolean; mode: string; warnings: string[] }
    }
  })
  const toolDownload = await toolDownloadPromise
  expect(toolDownload.suggestedFilename()).toBe('tool-wide-lead.vital')
  expect(toolExport).toEqual({
    filename: 'tool-wide-lead.vital',
    validation: {
      valid: true,
      mode: 'strict',
      warnings: [
        'Vital has no PatchState tags or modulation route IDs; import uses a vital-import tag and generated route IDs. Custom wavetable IDs are regenerated unless the table exactly matches the built-in registry.',
      ],
    },
  })
  const toolDownloadPath = await toolDownload.path()
  expect(toolDownloadPath).not.toBeNull()
  const independentlyDownloadedDocument = JSON.parse(
    await readFile(toolDownloadPath as string, 'utf8'),
  )
  const fixture = JSON.parse(
    await readFile('fixtures/vital/init.vital', 'utf8'),
  )
  expect(new VitalPresetAdapter(fixture).importPatchStrict(independentlyDownloadedDocument)).toMatchObject({
    patch: { metadata: { name: 'Wide Lead' } },
    sourceVersion: '1.0.7',
  })

  await presetSelector.selectOption('glass-pluck')
  await expect(page.getByTestId('history-size')).toHaveText('4')
  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'wide-lead.vital',
    mimeType: 'application/json',
    buffer: exportedBuffer,
  })

  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Wide Lead')
  await expect(presetSelector).toHaveValue('')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '5400')
  await expect(page.getByTestId('history-size')).toHaveText('5')
  await expect(page.getByTestId('vital-import-notice')).toHaveCount(0)
  await expect(page.getByTestId('export-filename')).toHaveText('wide-lead.vital')

  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-cutoff', '9200')

  await page.getByTestId('variant-b').click()
  await expect(page.getByTestId('current-variant')).toHaveText('B')
  await expect(presetSelector).toHaveValue('')
  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'wide-lead.vital',
    mimeType: 'application/json',
    buffer: exportedBuffer,
  })
  await expect(page.getByTestId('history-size')).toHaveText('2')
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Wide Lead')

  await page.getByTestId('variant-a').click()
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Glass Pluck')
  await expect(presetSelector).toHaveValue('glass-pluck')
  await page.getByTestId('variant-b').click()
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Wide Lead')
  await expect(presetSelector).toHaveValue('')

  const stateBeforeInvalidImport = await page.evaluate(() => {
    const audio = document.querySelector('[data-testid="audio-adapter-state"]')
    return {
      patchName: document.querySelector('.patch-actions')?.getAttribute('data-patch-name'),
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
        patchName: document.querySelector('.patch-actions')?.getAttribute('data-patch-name'),
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

  const selector = page.getByRole('combobox', { name: 'Preset' })
  const importButton = page.getByRole('button', { name: 'Import Vital' })
  const exportButton = page.getByRole('button', { name: 'Export Vital' })
  await expect(selector).toBeVisible()
  await expect(importButton).toBeVisible()
  await expect(exportButton).toBeVisible()
  await expect(selector.locator('option')).toHaveCount(15)
  await expect(page.getByTestId('hold-note')).toHaveCount(0)
  await expect(page.getByTestId('start-audio')).toHaveCount(0)
  await expect(page.getByTestId('note-48')).toHaveAttribute('aria-label', 'C 2, keyboard Z')
  await expect(page.getByTestId('note-60')).toHaveAttribute('aria-label', 'C 3, keyboard Q')
  await expect(page.getByTestId('note-72')).toHaveAttribute('aria-label', 'C 4, keyboard I')
  await expect(page.getByTestId('import-vital-input')).toHaveAttribute(
    'accept',
    '.vital,application/json',
  )

  await selector.selectOption('midnight-pad')
  await expect(selector).toHaveValue('midnight-pad')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SYNTH CREATOR')
  await expect(page.locator('.patch-actions')).toHaveAttribute('data-patch-name', 'Midnight Pad')
  await importButton.focus()
  await expect(importButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(exportButton).toBeFocused()

  const layout = await page.evaluate(() => {
    const importRect = document.querySelector('[data-testid="import-vital"]')!.getBoundingClientRect()
    const exportRect = document.querySelector('[data-testid="export-vital"]')!.getBoundingClientRect()
    const actionsRect = document.querySelector('.patch-actions')!.getBoundingClientRect()
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

test('native-feature imports stay intact, warn above the workbench, and preserve opaque state', async ({
  page,
}) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('vital-status')).toContainText('ready')

  const initialDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const initialDownload = await initialDownloadPromise
  const initialPath = await initialDownload.path()
  const nativeDocument = JSON.parse(await readFile(initialPath as string, 'utf8')) as {
    author: string
    preset_name: string
    settings: Record<string, unknown>
  }
  nativeDocument.author = 'Native preset author'
  nativeDocument.preset_name = 'Preserved Native Features'
  nativeDocument.settings.osc_1_destination = 1
  nativeDocument.settings.sample_on = 1
  nativeDocument.settings.distortion_on = 1
  ;(nativeDocument.settings.sample as Record<string, unknown>).name = 'Preserved sample layer'
  ;(nativeDocument.settings.modulations as Array<Record<string, unknown>>)[10] = {
    source: 'macro_control_1',
    destination: 'osc_1_level',
  }
  nativeDocument.settings.modulation_11_amount = 0.4
  nativeDocument.settings.macro_control_1 = 0.75
  const originalJson = `\n${JSON.stringify(nativeDocument, null, 2)}\n`

  await page.getByTestId('import-vital-input').setInputFiles({
    name: 'preserved-native-features.vital',
    mimeType: 'application/json',
    buffer: Buffer.from(originalJson),
  })

  const notice = page.getByTestId('vital-import-notice')
  await expect(notice).toHaveText(
    'Hidden effects: Distortion. Controls that may not behave as shown: OSC 1 level (Macro 1).',
  )
  const noticeAndLayout = await page.evaluate(() => ({
    noticeBottom: document
      .querySelector('[data-testid="vital-import-notice"]')!
      .getBoundingClientRect().bottom,
    layoutTop: document.querySelector('.workbench-layout')!.getBoundingClientRect().top,
  }))
  expect(noticeAndLayout.noticeBottom).toBeLessThanOrEqual(noticeAndLayout.layoutTop)

  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByTestId('preview-stop').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')

  const untouchedDownloadPromise = page.waitForEvent('download')
  const toolExport = await page.evaluate(async () => {
    const tool = (await document.modelContext!.getTools()).find(({ name }) => name === 'export_patch')
    if (!tool) throw new Error('export_patch was not registered')
    return JSON.parse(await document.modelContext!.executeTool(tool)) as {
      filename: string
      validation: {
        valid: boolean
        mode: string
        preservedFeatures: {
          affectedControls: Array<{ control: string; sources: string[] }>
          hiddenEffects: string[]
          preservesUnsupportedFeatures: boolean
          warnings: string[]
        }
      }
    }
  })
  const untouchedDownload = await untouchedDownloadPromise
  expect(await readFile((await untouchedDownload.path()) as string, 'utf8')).toBe(originalJson)
  expect(toolExport).toMatchObject({
    filename: 'preserved-native-features.vital',
    validation: {
      valid: true,
      mode: 'retained',
      preservedFeatures: {
        affectedControls: [{ control: 'OSC 1 level', sources: ['Macro 1'] }],
        hiddenEffects: ['Distortion'],
        preservesUnsupportedFeatures: true,
      },
    },
  })

  await page.locator('.darken-control').evaluate((button: HTMLButtonElement) => button.click())
  await expect(notice).toBeVisible()
  const editedDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-vital').click()
  const editedDownload = await editedDownloadPromise
  const editedDocument = JSON.parse(
    await readFile((await editedDownload.path()) as string, 'utf8'),
  ) as { settings: Record<string, unknown> }
  expect(editedDocument.settings).toMatchObject({
    distortion_on: 1,
    macro_control_1: 0.75,
    osc_1_destination: 1,
    sample_on: 1,
  })
  expect((editedDocument.settings.sample as Record<string, unknown>).name).toBe(
    'Preserved sample layer',
  )
})
