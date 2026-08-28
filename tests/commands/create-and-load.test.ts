import { describe, expect, it } from 'vitest'

import { CommandService } from '../../src/commands/CommandService'
import { createDefaultPatch } from '../../src/patch/defaults'
import { getPresetPatch } from '../../src/presets/registry'
import { SessionService } from '../../src/session/SessionService'

function createHarness() {
  const session = new SessionService(createDefaultPatch())
  const commands = new CommandService(session)
  return { commands, session }
}

describe('complete patch creation and curated loading', () => {
  it('replaces the active patch atomically with a complete diff and one undo entry', () => {
    const { commands, session } = createHarness()
    const before = session.getPatch()
    const createdPatch = getPresetPatch('glass-pluck')
    createdPatch.metadata.name = 'Agent Glass Study'
    createdPatch.wavetableData.glass.frames[0].harmonics[0] = 0.9

    const result = commands.createPatch({
      type: 'create_patch',
      reason: 'Create a short custom glass instrument',
      patch: createdPatch,
    })

    expect(result.summary.name).toBe('Agent Glass Study')
    expect(result.changed).toMatchObject({
      'metadata.name': { before: 'Ethereal Gate', after: 'Agent Glass Study' },
      'oscillators.0.wavetableId': { before: 'airy', after: 'glass' },
      wavetableData: {
        before: { ids: ['airy', 'sine'] },
        after: { ids: ['glass', 'triangle'] },
      },
    })
    expect(commands.historySize).toBe(1)
    expect(result.session).toMatchObject({ currentVariant: 'A', canUndo: true })

    const undone = commands.undo()
    expect(undone.patch).toEqual(before)
    expect(commands.historySize).toBe(0)
    expect(commands.futureSize).toBe(1)
  })

  it('rejects an invalid complete patch without changing state or history', () => {
    const { commands, session } = createHarness()
    const before = session.getPatch()
    const invalidPatch = getPresetPatch('wide-lead')
    invalidPatch.oscillators[0].wavetableId = 'missing-table'

    expect(() =>
      commands.createPatch({
        type: 'create_patch',
        reason: 'This invalid replacement must remain atomic',
        patch: invalidPatch,
      }),
    ).toThrow(/Unknown wavetable id/)
    expect(session.getPatch()).toEqual(before)
    expect(commands.historySize).toBe(0)
  })

  it('loads cloned curated state as one transaction and restores the prior patch on undo', () => {
    const { commands, session } = createHarness()
    const before = session.getPatch()
    const result = commands.loadPreset({ type: 'load_preset', presetId: 'warm-mono-bass' })

    expect(result.summary).toMatchObject({ name: 'Warm Mono Bass', category: 'bass' })
    expect(result.changed).toMatchObject({
      'metadata.name': { before: 'Ethereal Gate', after: 'Warm Mono Bass' },
      'voice.polyphony': { before: 8, after: 1 },
      'voice.legato': { before: false, after: true },
      wavetableData: {
        before: { ids: ['airy', 'sine'] },
        after: { ids: ['saw', 'soft-square'] },
      },
    })
    expect(commands.historySize).toBe(1)

    const registryCopy = getPresetPatch('warm-mono-bass')
    session.getPatch().metadata.name = 'Detached session copy'
    registryCopy.filter.cutoffHz = 20_000
    expect(getPresetPatch('warm-mono-bass').filter.cutoffHz).toBe(620)
    expect(commands.undo().patch).toEqual(before)
  })
})
