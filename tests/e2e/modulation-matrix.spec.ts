import { expect, test } from '@playwright/test'

test('routing matrix adds an oscillator 3 route and undo removes it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('start-audio').click()
  await page.getByTestId('hold-note').click()
  await page.getByRole('tab', { name: /Modulation & FX/ }).click()
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
