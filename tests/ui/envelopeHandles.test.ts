import { describe, expect, it } from 'vitest'
import { envelopeHandlePoints, envelopeValueFromPoint, hitTestEnvelopeHandle } from '../../src/ui/editors/envelopeHandles'

const envelope = { attackSeconds: .75, holdSeconds: 0, decaySeconds: 1.25, sustainLevel: .5, releaseSeconds: 2 }

describe('envelope handles', () => {
  it('maps sqrt-width geometry back to fields', () => {
    const points = envelopeHandlePoints(envelope)
    expect(envelopeValueFromPoint('attack', points.attack.x, points.attack.y, envelope)).toBeCloseTo(.75)
    expect(envelopeValueFromPoint('decay', points.decay.x, points.decay.y, envelope)).toBeCloseTo(1.25)
    expect(envelopeValueFromPoint('sustain', points.sustain.x, points.sustain.y, envelope)).toBeCloseTo(.5)
  })

  it('clamps values and hit tests visible handles', () => {
    expect(envelopeValueFromPoint('sustain', 50, -20, envelope)).toBe(1)
    expect(envelopeValueFromPoint('attack', 1000, 0, envelope)).toBe(3)
    const attack = envelopeHandlePoints(envelope).attack
    expect(hitTestEnvelopeHandle(envelope, attack.x, attack.y)).toBe('attack')
  })
})
