import { describe, expect, it } from 'vitest'

import { BrowserSynth } from '../../src/audio/BrowserSynth'
import { delayInsertMixGains, delayTimeSeconds } from '../../src/audio/delay'
import {
  BROWSER_OUTPUT_GAIN,
  BROWSER_OUTPUT_GAIN_DB,
  OUTPUT_LIMITER_SETTINGS,
  VOICE_BUS_HEADROOM_GAIN,
} from '../../src/audio/output'
import { reverbSendGains } from '../../src/audio/reverb'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionService } from '../../src/session/SessionService'
import { FakeAudioContext } from './fakes'

describe('browser effect topology', () => {
  it('uses equal-power dry/wet mixing for reverb', () => {
    const patch = createDefaultPatch()
    patch.effects.reverb.enabled = true
    patch.effects.reverb.mix = 0.5

    expect(reverbSendGains(patch.effects.reverb)).toEqual({
      dry: expect.closeTo(Math.SQRT1_2),
      wet: expect.closeTo(Math.SQRT1_2),
    })

    patch.effects.reverb.enabled = false
    expect(reverbSendGains(patch.effects.reverb)).toEqual({ dry: 1, wet: 0 })
  })

  it('uses Vital-style equal-power dry/wet mixing for delay', () => {
    const patch = createDefaultPatch()
    patch.effects.delay.enabled = true
    patch.effects.delay.mix = 0.5

    expect(delayInsertMixGains(patch.effects.delay)).toEqual({
      dry: expect.closeTo(Math.SQRT1_2),
      wet: expect.closeTo(Math.SQRT1_2),
    })

    patch.effects.delay.enabled = false
    expect(delayInsertMixGains(patch.effects.delay)).toEqual({ dry: 1, wet: 0 })
  })

  it.each([
    ['1/1', 2],
    ['1/2', 1],
    ['1/4', 0.5],
    ['1/8', 0.25],
    ['1/8T', 1 / 6],
    ['1/16', 0.125],
    ['1/16T', 1 / 12],
    ['1/32', 0.0625],
    ['1/64', 0.03125],
  ] as const)('maps delay division %s to %s seconds at 120 BPM', (division, expected) => {
    const delay = createDefaultPatch().effects.delay
    delay.mode = 'sync'
    delay.division = division
    expect(delayTimeSeconds(delay, 120)).toBeCloseTo(expected)
  })
})

describe('browser output stage', () => {
  it('adds a post-effects 2x gain with limiter protection while preserving voice-bus headroom', async () => {
    const context = new FakeAudioContext()
    const session = new SessionService(createDefaultPatch())
    const synth = new BrowserSynth(
      session,
      new LatencyTrace(false),
      () => context.asAudioContext(),
    )

    await synth.startAudio()

    expect(VOICE_BUS_HEADROOM_GAIN).toBe(0.72)
    expect(BROWSER_OUTPUT_GAIN).toBe(2)
    expect(BROWSER_OUTPUT_GAIN_DB).toBeCloseTo(6.0206, 4)
    expect(context.gains[0].gain.value).toBe(VOICE_BUS_HEADROOM_GAIN)
    expect(context.gains[1].gain.value).toBe(BROWSER_OUTPUT_GAIN)
    expect(context.compressors).toHaveLength(1)
    expect(context.compressors[0].threshold.value).toBe(OUTPUT_LIMITER_SETTINGS.thresholdDb)
    expect(context.compressors[0].ratio.value).toBe(OUTPUT_LIMITER_SETTINGS.ratio)
    expect(context.compressors[0].knee.value).toBe(OUTPUT_LIMITER_SETTINGS.kneeDb)

    synth.dispose()
  })
})
