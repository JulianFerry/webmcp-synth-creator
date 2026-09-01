import { expect, test } from '@playwright/test'

test('routing matrix adds an oscillator 3 route and undo removes it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('preview-note').click()
  await page.getByRole('tab', { name: 'Effects' }).click()
  const count = page.getByTestId('modulation-route-count')
  const before = Number((await count.textContent())?.split(' ')[0])
  const audioState = page.getByTestId('audio-adapter-state')
  const version = Number(await audioState.getAttribute('data-modulation-version'))
  await page.getByTestId('add-modulation-route').click()
  const index = before
  await expect(page.getByTestId(`route-${index}-destination`)).toHaveValue('oscillator3.wavetablePosition')
  await expect(count).toHaveText(`${before + 1} routes`)
  await expect(audioState).toHaveAttribute('data-modulation-version', String(version + 1))
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByTestId(`route-${index}-destination`)).toHaveCount(0)
})

test('modulation sources expose controls and routing follows processors', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Effects' }).click()

  await expect(page.getByTestId('mod-envelope-attack')).toBeVisible()
  await expect(page.getByTestId('mod-envelope-release')).toBeVisible()
  await expect(page.getByTestId('lfo-rate-mode')).toHaveCount(0)
  await expect(page.getByTestId('lfo-sync-division')).toBeVisible()
  await expect(page.getByTestId('lfo-phase')).toBeVisible()

  const envelopeGraph = page.getByLabel('Editable AHDSR amplitude envelope')
  const lfoGraph = page.getByLabel(/Editable LFO shape/)
  const envelopeBox = await envelopeGraph.boundingBox()
  const lfoBox = await lfoGraph.boundingBox()
  expect(envelopeBox?.height).toBeCloseTo(lfoBox?.height ?? 0, 0)

  const processorsComeFirst = await page.evaluate(() => {
    const processors = document.querySelector('.modfx-processors')
    const matrix = document.querySelector('.modulation-matrix-editor')
    return Boolean(processors && matrix && (processors.compareDocumentPosition(matrix) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(processorsComeFirst).toBe(true)
})
