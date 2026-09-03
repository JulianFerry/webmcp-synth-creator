import { expect, test } from '@playwright/test'

test('patch field follows the selected patch without a theme selector', async ({ page }) => {
  await page.goto('/')

  const shell = page.locator('.workbench-shell')
  const slider = page.locator('label[for="oscillator-1-level"]')
  const waterfall = page.getByTestId('oscillator-1-waterfall')

  await expect(shell).toHaveAttribute('data-color-theme', 'patch-graph-field')
  await expect(shell).toHaveAttribute('data-patch-variant', 'A')
  await expect(page.locator('.colour-theme-picker')).toHaveCount(0)
  await expect(slider).toHaveCSS('--slider-track-start', '#27b3c2')
  await expect(slider).toHaveCSS('--slider-track-end', '#4b6b72')
  await expect(slider).toHaveCSS('--slider-thumb-color', '#ff9f4a')
  await expect(page.getByTestId('amp-envelope-path')).toHaveCSS('stroke', 'rgba(39, 179, 194, 0.68)')
  await expect(page.locator('.envelope-plot .plot-area-stop-top')).toHaveCSS('stop-color', 'rgb(39, 179, 194)')
  await expect(waterfall).toHaveAttribute('data-graph-color', '#27b3c2')
  await expect(waterfall).toHaveAttribute('data-graph-end-color', '#ff9f4a')
  await expect(waterfall).toHaveAttribute('data-selected-line-color', '#ffffff')
  await expect(page.locator('.sidebar-title strong')).toHaveCSS('color', 'rgb(39, 179, 194)')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 23)')
  await expect(page.locator('.workbench-stage')).toHaveCSS('background-color', 'rgb(12, 20, 29)')

  await page.getByTestId('variant-b').click()
  await expect(shell).toHaveAttribute('data-patch-variant', 'B')
  await expect(slider).toHaveCSS('--slider-track-start', '#8261c8')
  await expect(page.getByTestId('amp-envelope-path')).toHaveCSS('stroke', 'rgba(130, 97, 200, 0.68)')
  await expect(waterfall).toHaveAttribute('data-graph-color', '#8261c8')
  await expect(page.locator('.sidebar-title strong')).toHaveCSS('color', 'rgb(130, 97, 200)')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 23)')
})
