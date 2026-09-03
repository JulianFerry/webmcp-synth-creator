import { describe, expect, it } from 'vitest'

import { CommandService } from '../../src/commands/CommandService'
import { createDefaultPatch } from '../../src/patch/defaults'
import { SessionService } from '../../src/session/SessionService'

describe('set_lfo_shape command', () => {
  it('commits one focused transaction while preserving rate and routes', () => {
    const session = new SessionService(createDefaultPatch())
    const commands = new CommandService(session)
    const before = session.getPatch()
    const points = [
      { x: 0, y: 0 },
      { x: 0.03, y: 1, power: 0.2 },
      { x: 0.14, y: 0 },
      { x: 1, y: 0 },
    ]

    const result = commands.setLfoShape({
      type: 'set_lfo_shape',
      reason: 'Shorten the second pulse',
      points,
    })

    expect(result.changed).toEqual({
      'lfo1.points': { before: before.lfo1.points, after: points },
    })
    expect(result.patch.lfo1.rate).toEqual(before.lfo1.rate)
    expect(result.patch.lfo1.smooth).toBe(before.lfo1.smooth)
    expect(result.patch.modulations).toEqual(before.modulations)
    expect(commands.historySize).toBe(1)
  })

  it('changes smoothing only when explicitly supplied', () => {
    const session = new SessionService(createDefaultPatch())
    const commands = new CommandService(session)
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ]
    const result = commands.setLfoShape({
      type: 'set_lfo_shape',
      reason: 'Use a smooth triangle',
      points,
      smooth: true,
    })
    expect(Object.keys(result.changed)).toEqual(['lfo1.points', 'lfo1.smooth'])
    expect(result.patch.lfo1.smooth).toBe(true)
    expect(commands.historySize).toBe(1)
  })
})

describe('set_lfo_point command', () => {
  it('edits coordinates and curve power in one focused transaction', () => {
    const session = new SessionService(createDefaultPatch())
    const commands = new CommandService(session)
    const before = session.getPatch()

    const result = commands.setLfoPoint({
      type: 'set_lfo_point',
      reason: 'Shorten and soften the second pulse',
      index: 4,
      x: 0.35,
      power: -0.25,
    })

    const expected = structuredClone(before.lfo1.points)
    expected[4] = { ...expected[4], x: 0.35, power: -0.25 }
    expect(result.changed).toEqual({
      'lfo1.points': { before: before.lfo1.points, after: expected },
    })
    expect(result.patch.lfo1.rate).toEqual(before.lfo1.rate)
    expect(result.patch.modulations).toEqual(before.modulations)
    expect(commands.historySize).toBe(1)
  })

  it('pins endpoint x values and clamps interior x values between neighbors', () => {
    const session = new SessionService(createDefaultPatch())
    const commands = new CommandService(session)

    const endpoint = commands.setLfoPoint({
      type: 'set_lfo_point', reason: 'Raise the first point', index: 0, x: 0.5, y: 0.25,
    })
    expect(endpoint.patch.lfo1.points[0]).toMatchObject({ x: 0, y: 0.25 })

    const interior = commands.setLfoPoint({
      type: 'set_lfo_point', reason: 'Constrain the second point', index: 1, x: 1,
    })
    expect(interior.patch.lfo1.points[1].x).toBe(
      interior.patch.lfo1.points[2].x - 0.001,
    )
  })

  it('rejects a missing point and curve power on the final point without committing', () => {
    const session = new SessionService(createDefaultPatch())
    const commands = new CommandService(session)
    const before = session.getPatch()
    expect(() => commands.setLfoPoint({
      type: 'set_lfo_point', reason: 'Edit a missing point', index: 31, y: 0.5,
    })).toThrow(/does not exist/)
    expect(() => commands.setLfoPoint({
      type: 'set_lfo_point', reason: 'Move and curve the final point',
      index: before.lfo1.points.length - 1, x: 0.75, y: 0.5, power: 0.5,
    })).toThrow(/Curve power cannot be set on the final LFO point/)
    expect(session.getPatch()).toEqual(before)
    expect(commands.historySize).toBe(0)
  })
})
