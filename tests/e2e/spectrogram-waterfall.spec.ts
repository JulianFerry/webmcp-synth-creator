import { expect, test } from '@playwright/test'

test('sidebar compares A and B with 3D spectral fingerprints', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('vital-status')).toContainText('ready')
  const variantA = page.getByTestId('variant-a-spectrogram')
  const variantB = page.getByTestId('variant-b-spectrogram')

  await expect(variantA).toHaveAttribute('data-color', '#27b3c2')
  await expect(variantB).toHaveAttribute('data-color', '#8261c8')
  await expect(variantA).toHaveAttribute('data-frequency-direction', 'left-to-right')
  await expect(variantA).toHaveAttribute('data-time-direction', 'back-to-front')
  await expect(variantA).toHaveAttribute('data-bins', '88')
  await expect(variantA).toHaveAttribute('data-depth-lines', '100')
  await expect(variantA).toHaveAttribute('data-duration-seconds', '2')
  await expect(variantA).toHaveAttribute('data-note-press-seconds', '1')
  await expect(variantA).toHaveAttribute('data-rotation-degrees', '34')
  await expect(variantA).toHaveAttribute('data-tilt-degrees', '30')
  await expect(variantB).toHaveAttribute('data-spectral-signature', 'unavailable')

  const box = await variantA.boundingBox()
  if (!box) throw new Error('Variant A spectrogram is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 - 12)
  await page.mouse.up()
  await expect(variantA).toHaveAttribute('data-rotation-degrees', '40')
  await expect(variantA).toHaveAttribute('data-tilt-degrees', '34')
  await expect(variantB).toHaveAttribute('data-rotation-degrees', '40')
  await expect(variantB).toHaveAttribute('data-tilt-degrees', '34')
  await variantA.dblclick()
  await expect(variantA).toHaveAttribute('data-rotation-degrees', '34')
  await expect(variantA).toHaveAttribute('data-tilt-degrees', '30')
  await expect(variantB).toHaveAttribute('data-rotation-degrees', '34')
  await expect(variantB).toHaveAttribute('data-tilt-degrees', '30')

  await expect(page.locator('.attribute-bars')).toHaveCount(0)
  await expect(page.locator('.variant-card-actions button')).toHaveCount(4)
  await expect(page.getByTestId('preview-variant-a')).toBeEnabled()
  await expect(page.getByTestId('preview-variant-b')).toBeDisabled()
  await expect(page.getByTestId('copy-variant-a-to-b')).toBeEnabled()
  await expect(page.getByTestId('copy-variant-b-to-a')).toBeDisabled()

  await page.getByTestId('copy-variant-a-to-b').click()
  await expect(variantB).not.toHaveAttribute('data-spectral-signature', 'unavailable')
  await expect(page.getByTestId('variant-a')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('preview-variant-b')).toBeEnabled()
  await expect(page.getByTestId('copy-variant-a-to-b')).toBeDisabled()
  await expect(page.getByTestId('copy-variant-b-to-a')).toBeDisabled()

  await page.getByTestId('variant-b').click()
  await page.getByTestId('oscillator-1-level').evaluate((element) => {
    const input = element as HTMLInputElement
    input.value = '0.4'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await expect(page.getByTestId('copy-variant-a-to-b')).toBeEnabled()
  await expect(page.getByTestId('copy-variant-b-to-a')).toBeEnabled()

  await page.getByTestId('copy-variant-a-to-b').click()
  await expect(page.getByTestId('variant-b')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-level', '0.62')
  await page.getByRole('button', { name: 'Undo transaction' }).click()
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-level', '0.4')

  await page.getByTestId('variant-a').click()
  await page.getByTestId('preview-variant-b').click()
  await expect(page.getByTestId('variant-b')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0', { timeout: 3_000 })
  await page.mouse.move(0, 0)

  const transferStyles = await Promise.all(
    ['preview-variant-b', 'export-vital'].map((testId) => page.getByTestId(testId).evaluate((element) => {
      const style = getComputedStyle(element)
      return { backgroundColor: style.backgroundColor, borderColor: style.borderColor, color: style.color }
    })),
  )
  expect(transferStyles[1]).toEqual(transferStyles[0])
})
