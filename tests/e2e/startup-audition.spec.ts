import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const artifactPresent = ['vital.mjs', 'vital.wasm'].every((filename) =>
  existsSync(resolve(process.cwd(), 'wasm/vital/build', filename)),
)

interface AudioProbe {
  closeCalls: number
  commands: string[]
  contextsCreated: number
  resumeCalls: number
  timeline: string[]
}

type ProbedWindow = typeof window & { __PHASE4_AUDIO_PROBE__: AudioProbe }

async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AudioProbe = {
      closeCalls: 0,
      commands: [],
      contextsCreated: 0,
      resumeCalls: 0,
      timeline: [],
    }
    ;(window as ProbedWindow).__PHASE4_AUDIO_PROBE__ = probe

    const NativeAudioContext = window.AudioContext
    class TrackedAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options)
        probe.contextsCreated += 1
      }

      override close(): Promise<void> {
        probe.closeCalls += 1
        return super.close()
      }

      override resume(): Promise<void> {
        probe.resumeCalls += 1
        return super.resume()
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: TrackedAudioContext,
    })

    const NativeAudioWorkletNode = window.AudioWorkletNode
    const TrackedAudioWorkletNode = new Proxy(NativeAudioWorkletNode, {
      construct(target, argumentsList) {
        const node = Reflect.construct(target, argumentsList, target) as AudioWorkletNode
        node.port.addEventListener('message', (event: MessageEvent<unknown>) => {
          if (
            typeof event.data === 'object' &&
            event.data !== null &&
            (event.data as { type?: unknown }).type === 'ready'
          ) {
            probe.timeline.push('ready')
          }
        })

        const nativeConnect = node.connect
        Object.defineProperty(node, 'connect', {
          configurable: true,
          value: ((...argumentsList: unknown[]) => {
            probe.timeline.push('connect')
            return Reflect.apply(nativeConnect, node, argumentsList)
          }) as AudioWorkletNode['connect'],
        })

        const nativePostMessage = node.port.postMessage
        Object.defineProperty(node.port, 'postMessage', {
          configurable: true,
          value: ((...argumentsList: unknown[]) => {
            const command = argumentsList[0]
            if (typeof command === 'object' && command !== null) {
              const type = (command as { type?: unknown }).type
              if (typeof type === 'string') probe.commands.push(type)
            }
            return Reflect.apply(nativePostMessage, node.port, argumentsList)
          }) as MessagePort['postMessage'],
        })
        return node
      },
    })
    Object.defineProperty(window, 'AudioWorkletNode', {
      configurable: true,
      value: TrackedAudioWorkletNode,
    })
  })
}

async function expectRunningWithoutError(page: Page, activeVoices: number): Promise<void> {
  await expect(page.getByTestId('audio-lifecycle')).toHaveText('running', { timeout: 30_000 })
  await expect(page.getByTestId('active-voice-count')).toHaveText(String(activeVoices))
  await expect(page.getByRole('alert')).toHaveCount(0)
}

test.describe('Phase 4 startup and audition lifecycle', () => {
  test.skip(!artifactPresent, 'Vital WASM artifact is not built')

  test('preloads without audio context startup and connects the worklet only after ready', async ({
    page,
  }) => {
    await installAudioProbe(page)
    const wasmResponse = page.waitForResponse(
      (response) => response.url().endsWith('/wasm/vital/build/vital.wasm') && response.ok(),
    )
    await page.goto('/')
    await wasmResponse
    await expect(page.getByTestId('vital-status')).toContainText('ready')

    expect(await page.evaluate(() => (window as ProbedWindow).__PHASE4_AUDIO_PROBE__)).toEqual({
      closeCalls: 0,
      commands: [],
      contextsCreated: 0,
      resumeCalls: 0,
      timeline: [],
    })
    await expect(page.getByTestId('audio-lifecycle')).toHaveText('suspended')

    await page.getByTestId('preview-note').click()
    await expectRunningWithoutError(page, 1)

    const probe = await page.evaluate(() => (window as ProbedWindow).__PHASE4_AUDIO_PROBE__)
    expect(probe.contextsCreated).toBe(1)
    expect(probe.timeline.indexOf('ready')).toBeGreaterThanOrEqual(0)
    expect(probe.timeline.indexOf('connect')).toBeGreaterThan(probe.timeline.indexOf('ready'))
    expect(probe.commands).toContain('note-on')

    await page.getByTestId('preview-stop').click()
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')
    expect(
      await page.evaluate(() => (window as ProbedWindow).__PHASE4_AUDIO_PROBE__.commands),
    ).toContain('all-notes-off')
  })

  const firstUseCases = [
    {
      activeVoices: 1,
      name: 'computer keyboard Z',
      release: async (page: Page) => page.keyboard.up('z'),
      start: async (page: Page) => page.keyboard.down('z'),
    },
    {
      activeVoices: 3,
      name: 'quick-preview chord',
      release: async (page: Page) => page.getByTestId('preview-stop').click(),
      start: async (page: Page) => page.getByTestId('preview-chord').click(),
    },
    {
      activeVoices: 1,
      name: 'quick-preview arpeggiator',
      release: async (page: Page) => page.getByTestId('preview-stop').click(),
      start: async (page: Page) => page.getByTestId('preview-arpeggiator').click(),
    },
  ] as const

  for (const firstUse of firstUseCases) {
    test(`starts cleanly on first ${firstUse.name} gesture`, async ({ page }) => {
      await page.goto('/')
      await firstUse.start(page)
      await expectRunningWithoutError(page, firstUse.activeVoices)
      await firstUse.release(page)
      await expect(page.getByTestId('active-voice-count')).toHaveText('0')
    })
  }

  test('releases notes after Stop, key-up, pointer cancel, blur, visibility, tabs, and variants', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByTestId('preview-note').click()
    await expectRunningWithoutError(page, 1)
    await page.getByTestId('preview-stop').click()
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')

    await page.keyboard.down('z')
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await page.getByRole('tab', { name: 'Effects' }).click()
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await page.keyboard.up('z')
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')

    const pointerKey = page.getByTestId('note-49')
    const pointerKeyBounds = await pointerKey.boundingBox()
    expect(pointerKeyBounds).not.toBeNull()
    await page.mouse.move(
      pointerKeyBounds!.x + pointerKeyBounds!.width / 2,
      pointerKeyBounds!.y + pointerKeyBounds!.height / 2,
    )
    await page.mouse.down()
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await pointerKey.dispatchEvent('pointercancel', {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
    })
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')
    await page.mouse.up()

    await page.keyboard.down('x')
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await page.getByRole('button', { exact: true, name: 'Create patch variant B' }).click()
    await expect(page.getByTestId('current-variant')).toHaveText('B')
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await page.getByRole('button', { exact: true, name: 'Select patch variant A' }).click()
    await expect(page.getByTestId('current-variant')).toHaveText('A')
    await page.keyboard.up('x')
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')

    await page.keyboard.down('c')
    await expect(page.getByTestId('active-voice-count')).toHaveText('1')
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')
    await page.keyboard.up('c')

    await page.getByTestId('preview-chord').click()
    await expect(page.getByTestId('active-voice-count')).toHaveText('3')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  })

  test('releases all worklet voices before page disposal', async ({ page }) => {
    await installAudioProbe(page)
    await page.goto('/')
    await page.getByTestId('preview-chord').click()
    await expectRunningWithoutError(page, 3)

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
    await expect
      .poll(() =>
        page.evaluate(() => ({
          closeCalls: (window as ProbedWindow).__PHASE4_AUDIO_PROBE__.closeCalls,
          commands: (window as ProbedWindow).__PHASE4_AUDIO_PROBE__.commands,
        })),
      )
      .toMatchObject({ closeCalls: 1, commands: expect.arrayContaining(['all-notes-off', 'dispose']) })

    const commands = await page.evaluate(
      () => (window as ProbedWindow).__PHASE4_AUDIO_PROBE__.commands,
    )
    expect(commands.lastIndexOf('all-notes-off')).toBeLessThan(commands.lastIndexOf('dispose'))
  })
})

test('missing Vital WASM is visible, actionable, and never falls back silently', async ({ page }) => {
  await installAudioProbe(page)
  await page.route('**/wasm/vital/build/vital.wasm', (route) =>
    route.fulfill({ body: '', contentType: 'application/wasm', status: 404 }),
  )
  await page.goto('/')

  const preparationError = page.getByTestId('audio-preparation-error')
  await expect(preparationError).toContainText('Vital audio could not be prepared')
  await expect(preparationError).toContainText('404 Not Found')
  await expect(preparationError).toContainText('rebuild or redeploy the Vital WASM artifacts')
  await expect(page.getByTestId('audio-lifecycle')).toHaveText('error')

  await page.getByTestId('preview-note').click()
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  await expect(preparationError).toBeVisible()
  expect(await page.evaluate(() => (window as ProbedWindow).__PHASE4_AUDIO_PROBE__)).toMatchObject({
    contextsCreated: 0,
    resumeCalls: 0,
  })
})
