import { describe, expect, it } from 'vitest'

import { CommandError, CommandService } from '../../src/commands/CommandService'
import { PatchHistory } from '../../src/commands/history'
import { LatencyTrace } from '../../src/dev/latencyTrace'
import { createDefaultPatch } from '../../src/patch/defaults'
import { getTemplatePatch } from '../../src/presets/templates'
import { SessionService } from '../../src/session/SessionService'

function createHarness() {
  let clock = 0
  const session = new SessionService(createDefaultPatch())
  const history = new PatchHistory()
  const trace = new LatencyTrace(true, () => ++clock)
  const commands = new CommandService(session, history, trace)
  return { commands, history, session, trace }
}

describe('CommandService', () => {
  it('applies a coherent multi-change command as one history entry and compact diff', () => {
    const { commands, history, session, trace } = createHarness()
    const before = session.getPatch()
    const result = commands.applyPatch(
      {
        type: 'apply_patch',
        reason: 'Make it darker without losing the airy layer',
        changes: [
          { path: 'filter.cutoffHz', value: 4200 },
          { path: 'oscillators.0.wavetablePosition', value: 0.5 },
        ],
      },
      { source: 'webmcp', correlationId: 'transaction-1' },
    )

    expect(history.size).toBe(1)
    expect(result.canUndo).toBe(true)
    expect(result.changed).toEqual({
      'filter.cutoffHz': { before: 7200, after: 4200 },
      'oscillators.0.wavetablePosition': { before: 0.62, after: 0.5 },
    })
    expect(result.current).toMatchObject({
      filter: { cutoffHz: 4200 },
      osc1: { wavetablePosition: 0.5 },
    })
    expect(result.undoStep).toBe(1)
    expect(session.getPatch().metadata).toEqual(before.metadata)
    expect(before.filter.cutoffHz).toBe(7200)
    expect(trace.getEvents().map((event) => event.stage)).toEqual([
      'request_received',
      'patch_committed',
    ])
  })

  it('resolves operations before validation and reports concrete musical-unit paths', () => {
    const { commands } = createHarness()

    const result = commands.applyPatch({
      type: 'apply_patch',
      reason: 'Darken the patch while keeping some air',
      changes: [{ op: 'tone', brightness: 0.2, keep_air: true }],
    })

    expect(result.changed).toMatchObject({
      'filter.cutoffHz': { before: 7200, after: expect.any(Number) },
    })
    expect(result.current).toEqual({ filter: result.patch.filter })
    expect(result.undoStep).toBe(1)
  })

  it('loads the built-in wavetable selected by a timbre operation', () => {
    const commands = new CommandService(new SessionService(getTemplatePatch('bass')))

    const result = commands.applyPatch({
      type: 'apply_patch',
      reason: 'Use the bright built-in wavetable',
      changes: [{ op: 'timbre', character: 'bright' }],
    })

    expect(result.patch.oscillators[0].wavetableId).toBe('airy')
    expect(result.patch.wavetableData.airy).toBeDefined()
    expect(commands.undo().patch.wavetableData.airy).toBeUndefined()
  })

  it('leaves patch, history, and subscribers untouched after atomic validation failure', () => {
    const { commands, history, session } = createHarness()
    const before = session.getPatch()
    let commitCount = 0
    session.subscribe(() => {
      commitCount += 1
    })

    expect(() =>
      commands.applyPatch({
        type: 'apply_patch',
        reason: 'Try a missing table after a valid cutoff',
        changes: [
          { path: 'filter.cutoffHz', value: 3600 },
          { path: 'oscillators.0.wavetableId', value: 'does-not-exist' },
        ],
      }),
    ).toThrow(/Unknown wavetable id/)

    expect(session.getPatch()).toEqual(before)
    expect(history.size).toBe(0)
    expect(commitCount).toBe(0)
  })

  it('rejects no-op commands rather than creating empty history', () => {
    const { commands, history } = createHarness()
    expect(() =>
      commands.applyPatch({
        type: 'apply_patch',
        reason: 'No actual change',
        changes: [{ path: 'filter.cutoffHz', value: 7200 }],
      }),
    ).toThrow(CommandError)
    expect(history.size).toBe(0)
  })

  it('undoes the entire semantic transaction in one operation', () => {
    const { commands, history, session } = createHarness()
    commands.applyPatch({
      type: 'apply_patch',
      reason: 'Two coordinated edits',
      changes: [
        { path: 'filter.cutoffHz', value: 3900 },
        { path: 'oscillators.0.level', value: 0.5 },
      ],
    })

    const result = commands.undo()
    expect(result.changed).toMatchObject({
      'filter.cutoffHz': { before: 3900, after: 7200 },
      'oscillators.0.level': { before: 0.5, after: 0.62 },
    })
    expect(session.getPatch().filter.cutoffHz).toBe(7200)
    expect(history.size).toBe(0)
    expect(result.canUndo).toBe(false)
  })

  it('toggles LFO modulation without replacing its retained configuration', () => {
    const { commands, session } = createHarness()
    const before = session.getPatch()

    const result = commands.applyPatch({
      type: 'apply_patch',
      reason: 'Disable the rhythmic gate without deleting it',
      changes: [{ path: 'lfo1.enabled', value: false }],
    })

    expect(result.changed).toEqual({
      'lfo1.enabled': { before: true, after: false },
    })
    expect(result.summary.lfo1.enabled).toBe(false)
    expect(result.patch.lfo1.points).toEqual(before.lfo1.points)
    expect(result.patch.lfo1.rate).toEqual(before.lfo1.rate)
    expect(result.patch.modulations).toEqual(before.modulations)
    expect(commands.historySize).toBe(1)

    expect(commands.undo().patch.lfo1.enabled).toBe(true)
  })

  it('creates a complete patch pair while leaving A active and both variants unbacked', () => {
    const { commands, session } = createHarness()
    const primary = getTemplatePatch('bass')
    primary.metadata.name = 'Warm Sub Bass'
    const alternative = getTemplatePatch('lead')
    alternative.metadata.name = 'Warm Saw Bass'

    const result = commands.createPatchPair(
      { type: 'create_patch', reason: 'Warm bass with sub weight', patch: primary },
      { type: 'create_patch', reason: 'Warm bass with saw harmonics', patch: alternative },
      'harmonic profile',
      { source: 'webmcp', correlationId: 'patch-pair-1' },
    )

    expect(result.session).toMatchObject({ currentVariant: 'A', hasVariantB: true })
    expect(session.getPatch('A').metadata.name).toBe('Warm Sub Bass')
    expect(session.getPatch('B').metadata.name).toBe('Warm Saw Bass')
    expect(session.getVitalBacking('A')).toBeNull()
    expect(session.getVitalBacking('B')).toBeNull()
    expect(commands.selectVariant('B').patch.metadata.name).toBe('Warm Saw Bass')
    expect(session.getSummary().currentVariant).toBe('B')
  })
})
