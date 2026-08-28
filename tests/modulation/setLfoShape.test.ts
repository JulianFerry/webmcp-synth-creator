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
