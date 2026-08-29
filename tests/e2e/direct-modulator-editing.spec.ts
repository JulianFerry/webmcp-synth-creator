import { expect, test, type Locator, type Page } from '@playwright/test'

async function dragBy(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Editor handle is not visible')
  const origin = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 7, pointerType: 'mouse', bubbles: true }
  await locator.dispatchEvent('pointerdown', origin)
  await locator.dispatchEvent('pointermove', { ...origin, clientX: origin.clientX + dx, clientY: origin.clientY + dy })
  await locator.dispatchEvent('pointerup', { ...origin, clientX: origin.clientX + dx, clientY: origin.clientY + dy })
}

test('direct envelope and LFO gestures are atomic, undoable, and cancellable', async ({ page }) => {
  await page.goto('/')
  const history = page.getByTestId('history-size')
  const sustain = page.getByTestId('amp-sustain-handle')
  const sustainBefore = await sustain.getAttribute('aria-valuenow')

  await dragBy(page, sustain, 0, -18)
  await expect(history).toHaveText('1')
  await expect(sustain).not.toHaveAttribute('aria-valuenow', sustainBefore ?? '')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(history).toHaveText('0')
  await expect(sustain).toHaveAttribute('aria-valuenow', sustainBefore ?? '')

  const point = page.getByTestId('lfo-point-1')
  const pointBefore = await point.getAttribute('aria-valuetext')
  await dragBy(page, point, 12, 10)
  await expect(history).toHaveText('1')
  await expect(point).not.toHaveAttribute('aria-valuetext', pointBefore ?? '')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(point).toHaveAttribute('aria-valuetext', pointBefore ?? '')

  const box = await sustain.boundingBox()
  if (!box) throw new Error('Sustain handle is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 20)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(history).toHaveText('0')
  await expect(sustain).toHaveAttribute('aria-valuenow', sustainBefore ?? '')
})

test('focused handles commit one transaction on key-up', async ({ page }) => {
  await page.goto('/')
  const sustain = page.getByTestId('amp-sustain-handle')
  await sustain.focus()
  await page.keyboard.down('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  await page.keyboard.up('ArrowUp')
  await expect(page.getByTestId('history-size')).toHaveText('1')

  const point = page.getByTestId('lfo-point-1')
  await point.focus()
  await page.keyboard.down('ArrowRight')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await page.keyboard.up('ArrowRight')
  await expect(page.getByTestId('history-size')).toHaveText('2')
})
