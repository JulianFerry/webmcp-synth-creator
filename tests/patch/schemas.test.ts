import { describe, expect, it } from 'vitest'

import verticalSliceFixture from '../../fixtures/patches/vertical-slice.patch.json'
import { createDefaultPatch } from '../../src/patch/defaults'
import { parseApplyPatchCommand, parsePatchState } from '../../src/patch/schemas'

describe('PatchState schema', () => {
  it('accepts the generated default and checked-in vertical slice fixture', () => {
    expect(parsePatchState(createDefaultPatch()).version).toBe(4)
    expect(parsePatchState(verticalSliceFixture)).toMatchObject({
      version: 4,
      metadata: { name: 'Ethereal Gate' },
    })
  })

  it.each([
    ['metadata', (patch: any) => (patch.metadata.name = '')],
    ['oscillator', (patch: any) => (patch.oscillators[0].level = 1.2)],
    ['amp envelope', (patch: any) => (patch.ampEnvelope.attackSeconds = 11)],
    ['mod envelope', (patch: any) => (patch.modEnvelope.sustainLevel = -0.1)],
    ['filter', (patch: any) => (patch.filter.cutoffHz = 20_001)],
    ['fractional filter cutoff', (patch: any) => (patch.filter.cutoffHz = 632.5)],
    ['LFO ordering', (patch: any) => (patch.lfo1.points[2].x = 0.01)],
    ['LFO first endpoint', (patch: any) => (patch.lfo1.points[0].x = 0.01)],
    ['LFO last endpoint', (patch: any) => (patch.lfo1.points.at(-1).x = 0.99)],
    ['modulation vocabulary', (patch: any) => (patch.modulations[0].destination = 'brightness')],
    ['voice', (patch: any) => (patch.voice.polyphony = 17)],
    ['delay', (patch: any) => (patch.effects.delay.feedback = 2)],
    ['reverb', (patch: any) => (patch.effects.reverb.decaySeconds = 21)],
    ['wavetable data', (patch: any) => (patch.wavetableData.airy.frames = [])],
    ['wavetable reference', (patch: any) => (patch.oscillators[0].wavetableId = 'missing')],
  ])('rejects invalid %s state', (_branch, mutate) => {
    const patch = createDefaultPatch()
    mutate(patch)
    expect(() => parsePatchState(patch)).toThrow()
  })

  it('rejects duplicate modulation route ids', () => {
    const patch = createDefaultPatch()
    patch.modulations[1].id = patch.modulations[0].id
    expect(() => parsePatchState(patch)).toThrow(/Duplicate modulation route id/)
  })

  it('accepts all browser filter response modes including notch', () => {
    for (const type of ['lowpass', 'highpass', 'bandpass', 'notch'] as const) {
      const patch = createDefaultPatch()
      patch.filter.type = type
      expect(parsePatchState(patch).filter.type).toBe(type)
    }
  })

  it('rejects a 24 dB notch slope that Vital cannot represent', () => {
    const patch = createDefaultPatch()
    patch.filter.type = 'notch'
    patch.filter.slope = 24
    expect(() => parsePatchState(patch)).toThrow(/Vital does not support a 24 dB notch/)
  })

  it.each(['1/1', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', '1/64'])(
    'accepts synchronized delay division %s',
    (division) => {
      const patch = createDefaultPatch()
      patch.effects.delay.mode = 'sync'
      patch.effects.delay.division = division as never
      expect(parsePatchState(patch).effects.delay.division).toBe(division)
    },
  )
})

describe('apply_patch command schema', () => {
  it('accepts a closed-path multi-change transaction', () => {
    const parsed = parseApplyPatchCommand({
      type: 'apply_patch',
      reason: 'Make the patch darker',
      changes: [
        { path: 'filter.cutoffHz', value: 4200 },
        { path: 'oscillators.0.wavetablePosition', value: 0.48 },
      ],
    })
    expect(parsed.changes).toHaveLength(2)
  })

  it('rejects unknown paths and out-of-bounds values while merging duplicate paths', () => {
    expect(() =>
      parseApplyPatchCommand({
        type: 'apply_patch',
        reason: 'Invent a control',
        changes: [{ path: 'filter.warmth', value: 0.5 }],
      }),
    ).toThrow(/Unsupported patch path/)

    expect(
      parseApplyPatchCommand({
        type: 'apply_patch',
        reason: 'Duplicate an edit',
        changes: [
          { path: 'filter.cutoffHz', value: 4000 },
          { path: 'filter.cutoffHz', value: 3500 },
        ],
      }).changes,
    ).toEqual([{ path: 'filter.cutoffHz', value: 3500 }])

    expect(() =>
      parseApplyPatchCommand({
        type: 'apply_patch',
        reason: 'Exceed a bound',
        changes: [{ path: 'oscillators.0.level', value: 3 }],
      }),
    ).toThrow()
  })

  it('anchors path-specific value errors to the failing change', () => {
    expect(() =>
      parseApplyPatchCommand({
        type: 'apply_patch',
        reason: 'Inspector generated an object for an unconstrained value schema',
        changes: [{ path: 'metadata.name', value: {} }],
      }),
    ).toThrow(/"path": \[\s*"changes",\s*0,\s*"value"/)
  })

  it('rejects fractional cutoff commands before preview or commit', () => {
    expect(() =>
      parseApplyPatchCommand({
        type: 'apply_patch',
        reason: 'Set a fractional cutoff',
        changes: [{ path: 'filter.cutoffHz', value: 632.5 }],
      }),
    ).toThrow()
  })
})
