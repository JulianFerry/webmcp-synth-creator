import { expect, test } from '@playwright/test'

test('spectrogram exposes its sampled grid and changes across contrasting presets', async ({ page }) => {
  await page.goto('/')
  const preview = page.getByLabel('C3 processed preview')
  const canvas = page.getByRole('img', { name: 'Effects-inclusive C3 spectrogram waterfall' })

  await expect(preview).toHaveAttribute('data-preview-render-id', '1', { timeout: 15_000 })
  await expect(canvas).toHaveAttribute('data-spectrogram-windows', '48')
  await expect(canvas).toHaveAttribute('data-spectrogram-bins', '48')

  await page.getByTestId('preset-selector').selectOption('warm-mono-bass')
  await expect(preview).toHaveAttribute('data-preview-render-id', '2', { timeout: 15_000 })
  const darkSignature = await canvas.getAttribute('data-spectrogram-signature')

  await page.getByTestId('preset-selector').selectOption('wide-lead')
  await expect(preview).toHaveAttribute('data-preview-render-id', '3', { timeout: 15_000 })
  await expect(canvas).not.toHaveAttribute('data-spectrogram-signature', darkSignature ?? '')
})
