import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 720, height: 1000 },
  { name: 'desktop', width: 1160, height: 1000 },
]

for (const viewport of viewports) {
  test(`deployment smoke renders on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const response = await page.goto('/')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Synth Creator')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expect(page.getByTestId('keyboard-surface')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0)

    await page.getByRole('tab', { name: 'Effects' }).click()
    await expect(page.getByTestId('effects-grid')).toBeVisible()

    const fixture = await page.request.get('/fixtures/vital/init.vital')
    expect(fixture.status()).toBe(200)
    expect((await fixture.body()).byteLength).toBeGreaterThan(100_000)
  })
}
