import { describe, expect, it } from 'vitest'

import { ARTICULATION_PRESETS } from '../../src/ops/articulationAndLayer'
import { selectArticulation } from '../../src/ops/articulationSelection'

describe('selectArticulation', () => {
  it.each([
    [0, 'pluck'],
    [0.02 / 0.85, 'sustain'],
    [0.45 / 0.85, 'pad'],
    [0.72 / 0.85, 'swell'],
    [1, 'reverse'],
  ] as const)('maps normalized attack %s to %s and its full envelope', (attack, kind) => {
    const selected = selectArticulation({ attack })
    expect(selected).toBe(kind)
    expect(ARTICULATION_PRESETS[selected]).toEqual(ARTICULATION_PRESETS[kind])
  })

  it.each([
    [0.02 / 0.7, 'reverse'],
    [0.04 / 0.7, 'percussive'],
    [0.06 / 0.7, 'stab'],
    [0.12 / 0.7, 'pluck'],
    [0.15 / 0.7, 'sustain'],
    [0.25 / 0.7, 'keys'],
    [0.5 / 0.7, 'bell'],
    [0.62 / 0.7, 'pad'],
    [1, 'swell'],
  ] as const)('maps normalized release %s to %s and its full envelope', (release, kind) => {
    const selected = selectArticulation({ release })
    expect(selected).toBe(kind)
    expect(ARTICULATION_PRESETS[selected]).toEqual(ARTICULATION_PRESETS[kind])
  })

  it.each([
    ['attack sustain/pad', 'attack', (0.02 + 0.45) / 2 / 0.85, 'sustain', 'pad'],
    ['attack pad/swell', 'attack', (0.45 + 0.72) / 2 / 0.85, 'pad', 'swell'],
    ['attack swell/reverse', 'attack', (0.72 + 0.85) / 2 / 0.85, 'swell', 'reverse'],
    ['release pluck/sustain', 'release', (0.12 + 0.15) / 2 / 0.7, 'pluck', 'sustain'],
    ['release bell/pad', 'release', (0.5 + 0.62) / 2 / 0.7, 'bell', 'pad'],
    ['release pad/swell', 'release', (0.62 + 0.7) / 2 / 0.7, 'pad', 'swell'],
  ] as const)('switches deterministically at the %s boundary', (_label, field, boundary, lower, upper) => {
    const select = (value: number) => selectArticulation({ [field]: value })
    expect(select(boundary - 1e-8)).toBe(lower)
    expect(select(boundary + 1e-8)).toBe(upper)
  })

  it('uses sustain only when neither normalized dimension is supplied', () => {
    expect(selectArticulation({})).toBe('sustain')
    expect(ARTICULATION_PRESETS[selectArticulation({})]).toEqual(ARTICULATION_PRESETS.sustain)
  })
})
