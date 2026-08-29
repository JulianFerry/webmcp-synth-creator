import { expect, test } from '@playwright/test'

test('overview position gesture commits once, updates analysis, and explains static tables', async ({ page }) => {
  await page.goto('/')
  const slider = page.getByTestId('overview-oscillator-3-position')
  const beforeHistory = Number(await page.getByTestId('history-size').textContent())
  const beforeWaveform = await page.getByTestId('processed-waveform-path').getAttribute('d')
  await slider.focus()
  await slider.press('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText(String(beforeHistory + 1))
  await expect.poll(async () => page.getByTestId('processed-waveform-path').getAttribute('d')).not.toBe(beforeWaveform)

  const source = page.getByTestId('overview-oscillator-1-wavetable')
  const options = await source.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ label: node.textContent ?? '', value: (node as HTMLOptionElement).value })))
  const staticOption = options.find((option) => /sine/i.test(option.label)) ?? options[0]
  await source.selectOption(staticOption.value)
  const staticSlider = page.getByTestId('overview-oscillator-1-position')
  await expect(staticSlider).toBeDisabled()
  await expect(staticSlider).toHaveAccessibleDescription(/one static frame/i)
})
