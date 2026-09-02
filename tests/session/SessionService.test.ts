import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CommandError, CommandService } from '../../src/commands/CommandService'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionError, SessionService } from '../../src/session/SessionService'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'

function createHarness(historyLimit = 30) {
  const session = new SessionService(createDefaultPatch(), undefined, historyLimit)
  const commands = new CommandService(session)
  return { commands, session }
}

function createWideVariant(commands: CommandService, replaceExisting = false) {
  return commands.createVariant({
    type: 'create_variant',
    reason: 'Create a wider B alternative',
    comparisonAxis: 'stereo width',
    changes: [
      { path: 'metadata.name', value: 'Ethereal Gate Wide B' },
      { path: 'oscillators.0.unisonVoices', value: 7 },
      { path: 'oscillators.0.stereoSpread', value: 1 },
    ],
    replaceExisting,
  })
}

describe('variant-local session state', () => {
  it('clones A to B and applies the creation edit as one isolated transaction', () => {
    const { commands, session } = createHarness()
    const originalA = session.getPatch()

    const result = createWideVariant(commands)
    const state = session.getState()

    expect(result.changed).toEqual({
      'metadata.name': { before: 'Ethereal Gate', after: 'Ethereal Gate Wide B' },
      'oscillators.0.unisonVoices': { before: 5, after: 7 },
      'oscillators.0.stereoSpread': { before: 0.88, after: 1 },
    })
    expect(result.session).toEqual({
      currentVariant: 'B',
      hasVariantB: true,
      canUndo: true,
      canRedo: false,
      comparisonAxis: 'stereo width',
    })
    expect(state.variants.A.present).toEqual(originalA)
    expect(state.variants.B?.past).toHaveLength(1)
    expect(state.variants.B?.present.metadata.name).toBe('Ethereal Gate Wide B')

    state.variants.A.present.filter.cutoffHz = 100
    state.variants.B!.present.oscillators[0].stereoSpread = 0
    expect(session.getPatch('A')).toEqual(originalA)
    expect(session.getPatch('B').oscillators[0].stereoSpread).toBe(1)
  })

  it('keeps undo and redo independent for A and B', () => {
    const { commands, session } = createHarness()
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Darken A',
      changes: [{ path: 'filter.cutoffHz', value: 6000 }],
    })
    createWideVariant(commands)
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Lower B oscillator level',
      changes: [{ path: 'oscillators.0.level', value: 0.4 }],
    })

    const undoB = commands.undo()
    expect(undoB.patch.oscillators[0].level).toBe(0.62)
    expect(undoB.patch.oscillators[0].stereoSpread).toBe(1)
    expect(undoB.session).toMatchObject({ currentVariant: 'B', canUndo: true, canRedo: true })

    const selectA = commands.selectVariant('A')
    expect(selectA.patch.filter.cutoffHz).toBe(6000)
    expect(selectA.patch.oscillators[0].stereoSpread).toBe(0.88)
    expect(selectA.session).toMatchObject({ currentVariant: 'A', canUndo: true, canRedo: false })

    expect(commands.undo().patch.filter.cutoffHz).toBe(7200)
    expect(session.getPatch('B').oscillators[0].stereoSpread).toBe(1)

    commands.selectVariant('B')
    const redoB = commands.redo()
    expect(redoB.patch.oscillators[0].level).toBe(0.4)
    expect(redoB.patch.filter.cutoffHz).toBe(6000)
    expect(session.getPatch('A').filter.cutoffHz).toBe(7200)
  })

  it('clears only the selected variant future after a new write', () => {
    const { commands, session } = createHarness()
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'First A edit',
      changes: [{ path: 'filter.cutoffHz', value: 5000 }],
    })
    commands.undo()
    expect(commands.canRedo).toBe(true)

    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Replacement A edit',
      changes: [{ path: 'filter.resonance', value: 0.3 }],
    })

    expect(commands.canRedo).toBe(false)
    expect(session.getState().variants.A.future).toEqual([])
    expect(() => commands.redo()).toThrow(CommandError)
  })

  it('bounds active-variant history while preserving the oldest reachable snapshot', () => {
    const { commands, session } = createHarness(2)
    for (const cutoffHz of [6000, 5000, 4000]) {
      commands.applyPatch({
        type: 'apply_patch',
        reason: `Set cutoff to ${cutoffHz}`,
        changes: [{ path: 'filter.cutoffHz', value: cutoffHz }],
      })
    }

    expect(session.getState().variants.A.past).toHaveLength(2)
    expect(commands.undo().patch.filter.cutoffHz).toBe(5000)
    expect(commands.undo().patch.filter.cutoffHz).toBe(6000)
    expect(commands.canUndo).toBe(false)
  })

  it('selects variants as navigation without adding or clearing history', () => {
    const { commands, session } = createHarness()
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Edit A before comparison',
      changes: [{ path: 'filter.cutoffHz', value: 6100 }],
    })
    createWideVariant(commands)
    const beforeSelection = session.getState()
    const eventKinds: string[] = []
    session.subscribe((event) => eventKinds.push(event.kind))

    commands.selectVariant('A')
    commands.selectVariant('B')
    const afterSelection = session.getState()

    expect(afterSelection.variants.A.past).toEqual(beforeSelection.variants.A.past)
    expect(afterSelection.variants.B?.past).toEqual(beforeSelection.variants.B?.past)
    expect(afterSelection.variants.A.future).toEqual(beforeSelection.variants.A.future)
    expect(afterSelection.variants.B?.future).toEqual(beforeSelection.variants.B?.future)
    expect(eventKinds).toEqual(['variant_select', 'variant_select'])
  })

  it('rejects absent or duplicate B operations without changing A', () => {
    const { commands, session } = createHarness()
    const originalA = session.getPatch()

    expect(() => commands.selectVariant('B')).toThrow(SessionError)
    expect(() =>
      commands.createVariant({
        type: 'create_variant',
        reason: 'Invalid atomic B edit',
        comparisonAxis: 'timbre',
        changes: [
          { path: 'filter.cutoffHz', value: 3000 },
          { path: 'oscillators.0.wavetableId', value: 'missing-table' },
        ],
      }),
    ).toThrow(/Unknown wavetable id/)
    expect(session.getSummary()).toMatchObject({ currentVariant: 'A', hasVariantB: false })
    expect(session.getPatch()).toEqual(originalA)

    createWideVariant(commands)
    expect(() => createWideVariant(commands)).toThrow(/Variant B already exists/)
    expect(session.getPatch('A')).toEqual(originalA)
  })

  it('requires explicit B replacement and can discard B back to A', () => {
    const { commands, session } = createHarness()
    const originalA = session.getPatch()
    createWideVariant(commands)
    commands.selectVariant('A')

    const replacement = createWideVariant(commands, true)
    expect(replacement.session).toMatchObject({ currentVariant: 'B', hasVariantB: true, comparisonAxis: 'stereo width' })
    expect(session.getState().variants.B?.past).toHaveLength(1)

    const discarded = commands.discardVariantB()
    expect(discarded.session).toEqual({
      currentVariant: 'A',
      hasVariantB: false,
      canUndo: false,
      canRedo: false,
    })
    expect(discarded.patch).toEqual(originalA)
    expect(session.getState().variants.B).toBeUndefined()
    expect(discarded.session).not.toHaveProperty('comparisonAxis')
  })

  it('preserves the comparison axis across selection and edits', () => {
    const { commands, session } = createHarness()
    createWideVariant(commands)
    commands.selectVariant('A')
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Precisely lower A cutoff',
      changes: [{ path: 'filter.cutoffHz', value: 5000 }],
    })
    commands.selectVariant('B')

    expect(session.getState().comparisonAxis).toBe('stereo width')
    expect(session.getSummary().comparisonAxis).toBe('stereo width')
  })

  it('keeps imported Vital backing variant-local and restores it across replacement history', () => {
    const { commands, session } = createHarness()
    const adapter = new VitalPresetAdapter(
      JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8')),
    )
    const importedDocument = adapter.exportPatch(createDefaultPatch()).document
    importedDocument.preset_name = 'Backed Native Patch'
    importedDocument.settings.osc_1_destination = 1
    const imported = adapter.importPatch(importedDocument, {
      originalJson: JSON.stringify(importedDocument, null, 2),
    })

    commands.createPatch(
      {
        type: 'create_patch',
        reason: 'Import a native-backed preset',
        patch: imported.patch,
      },
      { source: 'ui' },
      imported.backing,
    )
    expect(session.getVitalBackingInfo()?.preservesUnsupportedFeatures).toBe(true)

    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Edit the projection without dropping native state',
      changes: [{ path: 'filter.cutoffHz', value: 2_400 }],
    })
    expect(session.getVitalBacking()).not.toBeNull()
    commands.undo()
    expect(session.getVitalBacking()).not.toBeNull()
    commands.undo()
    expect(session.getVitalBacking()).toBeNull()
    commands.redo()
    expect(session.getVitalBackingInfo()?.preservesUnsupportedFeatures).toBe(true)

    createWideVariant(commands)
    expect(session.getVitalBacking('B')).not.toBeNull()
    commands.selectVariant('A')
    expect(session.getVitalBacking('A')).not.toBeNull()
    commands.loadPreset({ type: 'load_preset', presetId: 'glass-pluck' })
    expect(session.getVitalBacking('A')).toBeNull()
    commands.undo()
    expect(session.getVitalBacking('A')).not.toBeNull()
  })
})
