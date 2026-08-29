import { expect, test, type Page } from '@playwright/test'

const FILTER_CUTOFF_MIN_HZ = 20
const FILTER_CUTOFF_MAX_HZ = 20_000

function cutoffControlValue(cutoffHz: number): string {
  const position =
    Math.log(cutoffHz / FILTER_CUTOFF_MIN_HZ) /
    Math.log(FILTER_CUTOFF_MAX_HZ / FILTER_CUTOFF_MIN_HZ)
  return String(
    FILTER_CUTOFF_MIN_HZ + position * (FILTER_CUTOFF_MAX_HZ - FILTER_CUTOFF_MIN_HZ),
  )
}

async function installWebMcpDouble(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Tool = {
      name: string
      description: string
      inputSchema: Record<string, unknown>
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
      execute: (
        input: Record<string, unknown>,
        context: { signal: AbortSignal },
      ) => Promise<unknown>
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
        return JSON.stringify(
          await definition.execute(input, { signal: new AbortController().signal }),
        )
      },
      ontoolchange: null,
    }

    Object.defineProperty(Document.prototype, 'modelContext', {
      configurable: true,
      get: () => context,
    })
  })
}

test('playable voice stays gesture gated and steals the oldest voice at configured polyphony', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('audio-lifecycle')).toHaveText('suspended')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')

  await page.getByTestId('start-audio').click()
  await expect(page.getByTestId('audio-lifecycle')).toHaveText('running')

  const polyphony = page.getByTestId('voice-polyphony')
  await polyphony.focus()
  await polyphony.press('Home')
  await expect(polyphony).toHaveValue('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')

  await page.getByTestId('keyboard-surface').focus()
  await page.keyboard.down('a')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByTestId('note-on-timing')).toContainText('MIDI 48')
  const timing = await page.evaluate(() => {
    return (
      window as typeof window & {
        __WAVETABLE_WORKBENCH_NOTE_TIMING__?: {
          midi: number
          inputToVoiceReadyMs: number
          voiceGraphBuildMs: number
        }
      }
    ).__WAVETABLE_WORKBENCH_NOTE_TIMING__
  })
  expect(timing?.midi).toBe(48)
  expect(timing?.inputToVoiceReadyMs).toBeGreaterThanOrEqual(0)
  expect(timing?.voiceGraphBuildMs).toBeGreaterThanOrEqual(0)
  await page.keyboard.down('s')

  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await expect(page.getByTestId('stolen-voice-count')).toHaveText('1 click-safe steals')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-active-count', '1')

  await page.keyboard.up('a')
  await page.keyboard.up('s')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
})

test('playable voice commits one command after a slider gesture with many ephemeral values', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  const position = page.getByTestId('oscillator-1-position')
  const waveform = page.getByTestId('oscillator-1-waveform').locator('path')
  const initialWaveform = await waveform.getAttribute('d')

  await expect(position).toHaveValue('0.62')
  await position.evaluate((element) => {
    const input = element as HTMLInputElement
    for (const value of ['0.58', '0.52', '0.47', '0.42']) {
      input.value = value
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }
  })

  await expect(position).toHaveValue('0.42')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-preview-position',
    '0.42',
  )
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.62')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  expect(await waveform.getAttribute('d')).not.toBe(initialWaveform)

  await position.dispatchEvent('pointerup')

  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-preview-position',
    '',
  )
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.42')
  await expect(page.getByTestId('latest-diff')).toContainText(
    'oscillators.0.wavetablePosition',
  )
  await expect(page.getByTestId('undo-available')).toHaveText('available')
})

test('playable voice cancels an ephemeral wavetable position without state or history drift', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  const position = page.getByTestId('oscillator-1-position')
  const waveform = page.getByTestId('oscillator-1-waveform').locator('path')
  const initialWaveform = await waveform.getAttribute('d')

  await position.evaluate((element) => {
    const input = element as HTMLInputElement
    input.value = '0.18'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-preview-position',
    '0.18',
  )

  await position.dispatchEvent('pointercancel')

  await expect(position).toHaveValue('0.62')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-preview-position',
    '',
  )
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.62')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  expect(await waveform.getAttribute('d')).toBe(initialWaveform)

  await position.evaluate((element) => {
    const input = element as HTMLInputElement
    input.value = '0.27'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.darken-control')?.click()
  })

  await expect(position).toHaveValue('0.62')
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute(
    'data-preview-position',
    '',
  )
  await expect(page.getByTestId('audio-adapter-state')).toHaveAttribute('data-position', '0.62')
  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await expect(page.getByTestId('latest-diff')).not.toContainText(
    'oscillators.0.wavetablePosition',
  )
  expect(await waveform.getAttribute('d')).toBe(initialWaveform)
})

test('playable voice previews oscillator, filter, and sustain sliders before one commit each', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  const adapter = page.getByTestId('audio-adapter-state')
  const cases = [
    {
      testId: 'oscillator-1-level',
      value: '0.24',
      path: 'oscillators.0.level',
      canonicalAttribute: 'data-level',
      effectiveAttribute: 'data-effective-level',
      initial: '0.62',
      expectedValue: '0.24',
    },
    {
      testId: 'oscillator-1-fine',
      value: '17',
      path: 'oscillators.0.fineTuneCents',
      canonicalAttribute: 'data-fine',
      effectiveAttribute: 'data-effective-fine',
      initial: '0',
      expectedValue: '17',
    },
    {
      testId: 'oscillator-1-detune',
      value: '0.72',
      path: 'oscillators.0.unisonDetune',
      canonicalAttribute: 'data-detune',
      effectiveAttribute: 'data-effective-detune',
      initial: '0.36',
      expectedValue: '0.72',
    },
    {
      testId: 'amp-sustain',
      value: '0.41',
      path: 'ampEnvelope.sustainLevel',
      canonicalAttribute: 'data-sustain',
      effectiveAttribute: 'data-effective-sustain',
      initial: '0.78',
      expectedValue: '0.41',
    },
    {
      testId: 'filter-cutoff-control',
      value: cutoffControlValue(2_300),
      path: 'filter.cutoffHz',
      canonicalAttribute: 'data-cutoff',
      effectiveAttribute: 'data-effective-cutoff',
      initial: '7200',
      expectedValue: '2300',
    },
    {
      testId: 'filter-resonance',
      value: '0.65',
      path: 'filter.resonance',
      canonicalAttribute: 'data-resonance',
      effectiveAttribute: 'data-effective-resonance',
      initial: '0.14',
      expectedValue: '0.65',
    },
  ] as const

  for (const [index, previewCase] of cases.entries()) {
    if (previewCase.testId.startsWith('filter-')) {
      await page.getByRole('tab', { name: /Modulation & FX/ }).click()
    }
    const slider = page.getByTestId(previewCase.testId)
    await slider.evaluate((element, value) => {
      const input = element as HTMLInputElement
      input.value = value
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, previewCase.value)

    await expect(adapter).toHaveAttribute(previewCase.canonicalAttribute, previewCase.initial)
    await expect(adapter).toHaveAttribute(
      previewCase.effectiveAttribute,
      previewCase.expectedValue,
    )
    await expect(adapter).toHaveAttribute('data-preview-paths', previewCase.path)
    await expect(page.getByTestId('transaction-count')).toHaveText(String(index))
    await expect(page.getByTestId('history-size')).toHaveText(String(index))
    expect(
      await page.evaluate(() => window.__WAVETABLE_WORKBENCH_TRACE__?.getEvents().length ?? 0),
    ).toBe(index * 3)

    await slider.dispatchEvent('pointerup')

    await expect(adapter).toHaveAttribute(
      previewCase.canonicalAttribute,
      previewCase.expectedValue,
    )
    await expect(adapter).toHaveAttribute(
      previewCase.effectiveAttribute,
      previewCase.expectedValue,
    )
    await expect(adapter).toHaveAttribute('data-preview-count', '0')
    await expect(page.getByTestId('transaction-count')).toHaveText(String(index + 1))
    await expect(page.getByTestId('history-size')).toHaveText(String(index + 1))
    await expect(page.getByTestId('latest-diff')).toContainText(previewCase.path)
    expect(
      await page.evaluate(() => window.__WAVETABLE_WORKBENCH_TRACE__?.getEvents().length ?? 0),
    ).toBe((index + 1) * 3)
  }
})

test('playable voice cancels generalized previews back to canonical active audio', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  const adapter = page.getByTestId('audio-adapter-state')
  const previews = [
    ['oscillator-1-transpose', '12'],
    ['oscillator-1-fine', '21'],
    ['oscillator-1-unison', '3'],
    ['oscillator-1-detune', '0.72'],
    ['oscillator-1-spread', '0.34'],
    ['amp-attack', '0.75'],
    ['amp-decay', '3.2'],
    ['amp-release', '4.1'],
    ['voice-glide', '0.45'],
  ] as const

  for (const [testId, value] of previews) {
    await page.getByTestId(testId).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement
      input.value = nextValue
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, value)
  }

  await expect(adapter).toHaveAttribute('data-effective-transpose', '12')
  await expect(adapter).toHaveAttribute('data-effective-fine', '21')
  await expect(adapter).toHaveAttribute('data-effective-unison', '3')
  await expect(adapter).toHaveAttribute('data-effective-detune', '0.72')
  await expect(adapter).toHaveAttribute('data-effective-spread', '0.34')
  await expect(adapter).toHaveAttribute('data-draft-attack', '0.75')
  await expect(adapter).toHaveAttribute('data-draft-decay', '3.2')
  await expect(adapter).toHaveAttribute('data-draft-release', '4.1')
  await expect(adapter).toHaveAttribute('data-effective-attack', '0.18')
  await expect(adapter).toHaveAttribute('data-effective-decay', '0.9')
  await expect(adapter).toHaveAttribute('data-effective-release', '1.4')
  await expect(adapter).toHaveAttribute('data-effective-glide', '0.45')
  await expect(adapter).toHaveAttribute('data-preview-count', '9')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await expect(page.getByTestId('history-size')).toHaveText('0')

  for (const [testId] of previews) await page.getByTestId(testId).dispatchEvent('pointercancel')

  await expect(adapter).toHaveAttribute('data-effective-transpose', '0')
  await expect(adapter).toHaveAttribute('data-effective-fine', '0')
  await expect(adapter).toHaveAttribute('data-effective-unison', '5')
  await expect(adapter).toHaveAttribute('data-effective-detune', '0.36')
  await expect(adapter).toHaveAttribute('data-effective-spread', '0.88')
  await expect(adapter).toHaveAttribute('data-draft-attack', '0.18')
  await expect(adapter).toHaveAttribute('data-draft-decay', '0.9')
  await expect(adapter).toHaveAttribute('data-draft-release', '1.4')
  await expect(adapter).toHaveAttribute('data-effective-attack', '0.18')
  await expect(adapter).toHaveAttribute('data-effective-decay', '0.9')
  await expect(adapter).toHaveAttribute('data-effective-release', '1.4')
  await expect(adapter).toHaveAttribute('data-effective-glide', '0')
  await expect(adapter).toHaveAttribute('data-preview-count', '0')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  expect(
    await page.evaluate(() => window.__WAVETABLE_WORKBENCH_TRACE__?.getEvents().length ?? 0),
  ).toBe(0)
})

test('playable voice previews keyboard slider input and commits only on key release', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  const adapter = page.getByTestId('audio-adapter-state')
  const level = page.getByTestId('oscillator-1-level')
  await level.focus()

  await page.keyboard.down('ArrowLeft')
  await expect(adapter).toHaveAttribute('data-level', '0.62')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.61')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await page.keyboard.press('Escape')
  await expect(level).toHaveValue('0.62')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.62')
  await page.keyboard.up('ArrowLeft')
  await expect(page.getByTestId('transaction-count')).toHaveText('0')

  await page.keyboard.down('ArrowRight')
  await expect(adapter).toHaveAttribute('data-level', '0.62')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.63')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  await page.keyboard.up('ArrowRight')

  await expect(adapter).toHaveAttribute('data-level', '0.63')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.63')
  await expect(adapter).toHaveAttribute('data-preview-count', '0')
  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')
})

test('playable voice keeps cutoff slider, plot, preview, commit, and keyboard on one logarithmic whole-Hz scale', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('hold-note').click()
  await page.getByRole('tab', { name: /Modulation & FX/ }).click()
  const adapter = page.getByTestId('audio-adapter-state')
  const cutoff = page.getByTestId('filter-cutoff-control')
  const cutoffOutput = page.locator('label[for="filter-cutoff-control"] output')

  await expect(cutoff).toHaveAttribute('min', String(FILTER_CUTOFF_MIN_HZ))
  await expect(cutoff).toHaveAttribute('max', String(FILTER_CUTOFF_MAX_HZ))
  await expect(cutoff).toHaveAttribute('step', 'any')
  await expect(cutoff).toHaveAttribute('aria-valuemin', String(FILTER_CUTOFF_MIN_HZ))
  await expect(cutoff).toHaveAttribute('aria-valuemax', String(FILTER_CUTOFF_MAX_HZ))

  await cutoff.evaluate((element) => {
    const input = element as HTMLInputElement
    const minimum = Number(input.min)
    const maximum = Number(input.max)
    for (const position of [0.25, 0.5]) {
      input.value = String(minimum + position * (maximum - minimum))
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }
  })

  const geometricMidpoint = Math.round(
    Math.sqrt(FILTER_CUTOFF_MIN_HZ * FILTER_CUTOFF_MAX_HZ),
  )
  await expect(cutoff).toHaveAttribute('aria-valuenow', String(geometricMidpoint))
  await expect(cutoff).toHaveAttribute('data-parameter-value', String(geometricMidpoint))
  await expect(cutoffOutput).toHaveText(`${geometricMidpoint} Hz`)
  await expect(page.getByTestId('filter-cutoff')).toHaveText(`${geometricMidpoint} Hz`)
  await expect(adapter).toHaveAttribute('data-cutoff', '7200')
  await expect(adapter).toHaveAttribute('data-effective-cutoff', String(geometricMidpoint))
  await expect(page.getByTestId('transaction-count')).toHaveText('0')
  await expect(page.getByTestId('history-size')).toHaveText('0')
  expect(await cutoff.getAttribute('data-scale-position')).toBe(
    await page.getByTestId('filter-cutoff-line').getAttribute('data-cutoff-position'),
  )

  await cutoff.dispatchEvent('pointerup')

  await expect(adapter).toHaveAttribute('data-cutoff', String(geometricMidpoint))
  await expect(adapter).toHaveAttribute('data-effective-cutoff', String(geometricMidpoint))
  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await expect(page.getByTestId('latest-diff')).toContainText('filter.cutoffHz')

  await cutoff.focus()
  await page.keyboard.down('ArrowRight')
  const arrowValue = Math.round(geometricMidpoint * 10 ** 0.03)
  await expect(cutoff).toHaveAttribute('data-parameter-value', String(arrowValue))
  await expect(adapter).toHaveAttribute('data-cutoff', String(geometricMidpoint))
  await expect(adapter).toHaveAttribute('data-effective-cutoff', String(arrowValue))
  await expect(page.getByTestId('history-size')).toHaveText('1')
  await page.keyboard.up('ArrowRight')
  await expect(adapter).toHaveAttribute('data-cutoff', String(arrowValue))
  await expect(page.getByTestId('history-size')).toHaveText('2')

  await page.keyboard.down('PageUp')
  const pageValue = Math.round(arrowValue * 10 ** 0.3)
  await expect(cutoff).toHaveAttribute('data-parameter-value', String(pageValue))
  await expect(adapter).toHaveAttribute('data-cutoff', String(arrowValue))
  await expect(adapter).toHaveAttribute('data-effective-cutoff', String(pageValue))
  await page.keyboard.up('PageUp')
  await expect(adapter).toHaveAttribute('data-cutoff', String(pageValue))
  await expect(page.getByTestId('history-size')).toHaveText('3')

  await cutoff.press('Home')
  await expect(cutoff).toHaveAttribute('data-parameter-value', String(FILTER_CUTOFF_MIN_HZ))
  await expect(adapter).toHaveAttribute('data-cutoff', String(FILTER_CUTOFF_MIN_HZ))
  await cutoff.press('End')
  await expect(cutoff).toHaveAttribute('data-parameter-value', String(FILTER_CUTOFF_MAX_HZ))
  await expect(adapter).toHaveAttribute('data-cutoff', String(FILTER_CUTOFF_MAX_HZ))
  await expect(page.getByTestId('history-size')).toHaveText('5')
})

test('playable voice reconciles drafts after an external WebMCP update and undo', async ({ page }) => {
  await installWebMcpDouble(page)
  await page.goto('/')
  await expect(page.getByTestId('webmcp-status')).toContainText('available')
  await page.getByTestId('hold-note').click()
  const adapter = page.getByTestId('audio-adapter-state')

  for (const [testId, value] of [
    ['oscillator-1-level', '0.2'],
    ['amp-sustain', '0.32'],
  ] as const) {
    await page.getByTestId(testId).evaluate((element, nextValue) => {
      const input = element as HTMLInputElement
      input.value = nextValue
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, value)
  }
  await expect(adapter).toHaveAttribute('data-preview-count', '2')

  await page.evaluate(async () => {
    const tools = await document.modelContext!.getTools()
    const applyPatch = tools.find((tool) => tool.name === 'apply_patch')
    if (!applyPatch) throw new Error('apply_patch was not registered')
    await document.modelContext!.executeTool(applyPatch, {
      reason: 'External resonance update during a local draft',
      changes: [{ path: 'filter.resonance', value: 0.6 }],
    })
  })

  await expect(adapter).toHaveAttribute('data-preview-count', '0')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.62')
  await expect(adapter).toHaveAttribute('data-effective-sustain', '0.78')
  await expect(adapter).toHaveAttribute('data-effective-cutoff', '7200')
  await expect(adapter).toHaveAttribute('data-effective-resonance', '0.6')
  await expect(page.getByTestId('oscillator-1-level')).toHaveValue('0.62')
  await expect(page.getByTestId('amp-sustain')).toHaveValue('0.78')
  await page.getByRole('tab', { name: /Modulation & FX/ }).click()
  await expect(page.getByTestId('filter-cutoff-control')).toHaveAttribute(
    'data-parameter-value',
    '7200',
  )
  await expect(page.getByTestId('transaction-count')).toHaveText('1')
  await expect(page.getByTestId('history-size')).toHaveText('1')

  await page.getByRole('tab', { name: /Overview/ }).click()
  await page.getByTestId('oscillator-1-level').evaluate((element) => {
    const input = element as HTMLInputElement
    input.value = '0.31'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  await expect(adapter).toHaveAttribute('data-preview-count', '1')
  await page.getByRole('button', { name: 'Undo transaction' }).click()

  await expect(adapter).toHaveAttribute('data-preview-count', '0')
  await expect(adapter).toHaveAttribute('data-effective-level', '0.62')
  await expect(adapter).toHaveAttribute('data-effective-resonance', '0.14')
  await expect(page.getByTestId('oscillator-1-level')).toHaveValue('0.62')
  await expect(page.getByTestId('transaction-count')).toHaveText('2')
  await expect(page.getByTestId('history-size')).toHaveText('0')
})

test('playable voice keeps computer-keyboard audition active after controls and releases on lifecycle loss', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByTestId('oscillator-1-enabled').click()
  await page.keyboard.down('a')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.keyboard.up('a')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')

  await page.getByTestId('oscillator-1-level').focus()
  await page.keyboard.down('s')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.keyboard.up('s')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')

  await page.evaluate(() => {
    const input = document.createElement('input')
    input.dataset.testid = 'editable-regression-field'
    document.querySelector('main')?.append(input)
    input.focus()
  })
  await page.keyboard.down('d')
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  await page.keyboard.up('d')

  await page.getByTestId('oscillator-1-enabled').focus()
  await page.keyboard.down('f')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  await page.keyboard.up('f')

  await page.keyboard.down('g')
  await expect(page.getByTestId('active-voice-count')).toHaveText('1')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByTestId('active-voice-count')).toHaveText('0')
  await page.keyboard.up('g')
})

test('playable voice derives static wavetable, ADSR, and filter visuals from effective values', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('oscillator-2-position')).toBeDisabled()
  await expect(page.getByTestId('oscillator-2-morph-status')).toHaveText(
    'One frame - position unavailable',
  )
  await expect(page.getByTestId('oscillator-2-waveform')).toHaveAttribute(
    'aria-label',
    /single static frame/,
  )

  const envelopePath = page.getByTestId('amp-envelope-path')
  const envelopeLabels = await page
    .locator('.envelope-controls .parameter-control > span')
    .allTextContents()
  expect(envelopeLabels).toEqual(['Attack', 'Decay', 'Sustain', 'Release'])

  for (const [testId, value] of [
    ['amp-attack', '1.2'],
    ['amp-decay', '2.5'],
    ['amp-sustain', '0.3'],
    ['amp-release', '4'],
  ] as const) {
    const slider = page.getByTestId(testId)
    const before = await envelopePath.getAttribute('d')
    const transactions = Number(await page.getByTestId('transaction-count').textContent())
    await slider.evaluate((element, nextValue) => {
      const input = element as HTMLInputElement
      input.value = nextValue
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, value)
    const preview = await envelopePath.getAttribute('d')
    expect(preview).not.toBe(before)
    await expect(page.getByTestId('transaction-count')).toHaveText(String(transactions))
    await slider.dispatchEvent('pointerup')
    await expect(page.getByTestId('transaction-count')).toHaveText(String(transactions + 1))
    expect(await envelopePath.getAttribute('d')).toBe(preview)
  }
  expect(await page.locator('.envelope-controls output').allTextContents()).toEqual([
    '1.20 s',
    '2.50 s',
    '30%',
    '4.00 s',
  ])

  await page.getByRole('tab', { name: /Modulation & FX/ }).click()
  const filterType = page.getByTestId('filter-type')
  const filterPath = page.getByTestId('filter-response-path')
  const responsePaths = new Set<string>()
  responsePaths.add((await filterPath.getAttribute('d')) ?? '')
  for (const type of ['highpass', 'bandpass', 'notch'] as const) {
    await filterType.selectOption(type)
    await expect(page.getByTestId('filter-plot')).toHaveAttribute('data-filter-mode', type)
    responsePaths.add((await filterPath.getAttribute('d')) ?? '')
  }
  expect(responsePaths.size).toBe(4)
  await expect(page.getByTestId('filter-plot').getByRole('img')).toHaveAccessibleName(
    /Notch response/,
  )

  const cutoff = page.getByTestId('filter-cutoff-control')
  const beforeCutoffPreview = await filterPath.getAttribute('d')
  const transactions = Number(await page.getByTestId('transaction-count').textContent())
  await cutoff.evaluate((element) => {
    const input = element as HTMLInputElement
    const minimum = Number(input.min)
    const maximum = Number(input.max)
    const position = Math.log(2_520 / minimum) / Math.log(maximum / minimum)
    input.value = String(minimum + position * (maximum - minimum))
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  await expect(page.getByTestId('filter-cutoff')).toHaveText('2,520 Hz')
  expect(await filterPath.getAttribute('d')).not.toBe(beforeCutoffPreview)
  await expect(page.getByTestId('transaction-count')).toHaveText(String(transactions))
  await cutoff.dispatchEvent('pointerup')
  await expect(page.getByTestId('transaction-count')).toHaveText(String(transactions + 1))
  await expect(page.getByTestId('filter-cutoff')).toHaveText('2,520 Hz')
})

test('playable voice OfflineAudioContext render changes in expected oscillator, pitch, level, envelope, and filter directions', async ({
  page,
}) => {
  await page.goto('/')

  const metrics = await page.evaluate(async () => {
    type OfflineMetrics = {
      rms: number
      activeDurationSeconds: number
      zeroCrossingHz: number
      highFrequencyEnergy: number
    }
    type Patch = {
      oscillators: Array<{
        enabled: boolean
        wavetableId: string
        level: number
        transposeSemitones: number
        unisonVoices: number
      }>
      ampEnvelope: {
        attackSeconds: number
        holdSeconds: number
        decaySeconds: number
        sustainLevel: number
        releaseSeconds: number
      }
      filter: { enabled: boolean; cutoffHz: number; resonance: number }
    }

    const loadModules = new Function(
      'return Promise.all([import("/src/patch/defaults.ts"), import("/src/audio/offline.ts")])',
    ) as () => Promise<
      [
        { createDefaultPatch: () => Patch },
        {
          renderOfflineVoice: (
            patch: Patch,
            options: Record<string, number>,
          ) => Promise<OfflineMetrics>
        },
      ]
    >
    const [{ createDefaultPatch }, { renderOfflineVoice }] = await loadModules()
    const base = createDefaultPatch()
    base.oscillators[0].unisonVoices = 1
    base.oscillators[1].unisonVoices = 1
    base.oscillators[1].enabled = false
    base.ampEnvelope = {
      attackSeconds: 0.01,
      holdSeconds: 0,
      decaySeconds: 0.03,
      sustainLevel: 0.8,
      releaseSeconds: 0.08,
    }
    base.filter.enabled = true
    base.filter.cutoffHz = 8_000
    base.filter.resonance = 0

    const options = {
      midi: 60,
      velocity: 1,
      noteOffSeconds: 0.2,
      durationSeconds: 0.9,
      sampleRate: 24_000,
    }
    const render = (patch: Patch) => renderOfflineVoice(patch, options)
    const copy = (patch: Patch) => structuredClone(patch)

    const silent = copy(base)
    silent.oscillators[0].enabled = false

    const quiet = copy(base)
    quiet.oscillators[0].level = base.oscillators[0].level * 0.2

    const sine = copy(base)
    sine.oscillators[0].wavetableId = 'sine'
    const highPitch = copy(sine)
    highPitch.oscillators[0].transposeSemitones = 12

    const longRelease = copy(base)
    longRelease.ampEnvelope.releaseSeconds = 0.55

    const dark = copy(base)
    dark.filter.cutoffHz = 450

    const [baseMetrics, silentMetrics, quietMetrics, sineMetrics, highPitchMetrics, longMetrics, darkMetrics] =
      await Promise.all([
        render(base),
        render(silent),
        render(quiet),
        render(sine),
        render(highPitch),
        render(longRelease),
        render(dark),
      ])

    return {
      base: baseMetrics,
      silent: silentMetrics,
      quiet: quietMetrics,
      sine: sineMetrics,
      highPitch: highPitchMetrics,
      longRelease: longMetrics,
      dark: darkMetrics,
    }
  })

  expect(metrics.base.rms).toBeGreaterThan(0.001)
  expect(metrics.silent.rms).toBeLessThan(metrics.base.rms * 0.02)
  expect(metrics.quiet.rms).toBeLessThan(metrics.base.rms * 0.35)
  expect(metrics.highPitch.zeroCrossingHz).toBeGreaterThan(metrics.sine.zeroCrossingHz * 1.7)
  expect(metrics.longRelease.activeDurationSeconds).toBeGreaterThan(
    metrics.base.activeDurationSeconds + 0.2,
  )
  expect(metrics.dark.highFrequencyEnergy).toBeLessThan(metrics.base.highFrequencyEnergy * 0.65)
})
