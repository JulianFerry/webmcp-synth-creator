import { describe, expect, it } from 'vitest'

import { PatchHistory } from '../../src/commands/history'
import { createDefaultPatch } from '../../src/patch/defaults'

describe('PatchHistory', () => {
  it('bounds immutable snapshots', () => {
    const history = new PatchHistory(2)
    const patch = createDefaultPatch()
    for (const cutoff of [6000, 5000, 4000]) {
      const after = structuredClone(patch)
      after.filter.cutoffHz = cutoff
      history.push({
        before: patch,
        after,
        changed: { 'filter.cutoffHz': { before: 7200, after: cutoff } },
        reason: String(cutoff),
      })
    }
    patch.filter.cutoffHz = 100

    expect(history.size).toBe(2)
    expect(history.pop()?.reason).toBe('4000')
    expect(history.pop()?.before.filter.cutoffHz).toBe(7200)
  })
})
