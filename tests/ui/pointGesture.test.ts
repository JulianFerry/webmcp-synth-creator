import { describe, expect, it } from 'vitest'
import { beginPointGesture, cancelPointGesture, commitPointGesture, updatePointGesture } from '../../src/ui/editors/pointGesture'

describe('point gesture state', () => {
  it('updates a draft and accepts exactly at commit', () => {
    const updated = updatePointGesture(beginPointGesture(1), 2)
    expect(updated).toEqual({ committed: 1, draft: 2, active: true })
    expect(commitPointGesture(updated)).toEqual({ committed: 2, draft: 2, active: false })
  })

  it('restores committed geometry on cancel or rejection', () => {
    const updated = updatePointGesture(beginPointGesture({ x: 0 }), { x: 1 })
    expect(cancelPointGesture(updated).draft).toEqual({ x: 0 })
    expect(commitPointGesture(updated, false).draft).toEqual({ x: 0 })
  })
})
