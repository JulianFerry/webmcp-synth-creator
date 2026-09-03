import { describe, expect, it } from 'vitest'
import { envelopeHandlePoints, envelopeValueFromPoint, hitTestEnvelopeHandle } from '../../src/ui/editors/envelopeHandles'
import { envelopeCurvePosition } from '../../src/audio/lfo'

const envelope = { delaySeconds: .2, attackSeconds: .75, holdSeconds: .4, decaySeconds: 1.25, sustainLevel: .5, releaseSeconds: 2, attackCurve: .1, decayCurve: -.2, releaseCurve: .3 }

describe('envelope handles', () => {
  it('maps sqrt-width geometry back to fields', () => {
    const points = envelopeHandlePoints(envelope)
    expect(envelopeValueFromPoint('delay', points.delay.x, points.delay.y, envelope)).toBeCloseTo(.2)
    expect(envelopeValueFromPoint('attack', points.attack.x, points.attack.y, envelope)).toBeCloseTo(.75)
    expect(envelopeValueFromPoint('hold', points.hold.x, points.hold.y, envelope)).toBeCloseTo(.4)
    expect(envelopeValueFromPoint('decay', points.decay.x, points.decay.y, envelope)).toBeCloseTo(1.25)
    expect(envelopeValueFromPoint('sustain', points.sustain.x, points.sustain.y, envelope)).toBeCloseTo(.5)
    expect(envelopeValueFromPoint('release', points.release.x, points.release.y, envelope)).toBeCloseTo(2)
    expect(envelopeValueFromPoint('attackCurve', points.attackCurve.x, points.attackCurve.y, envelope)).toBeCloseTo(.1)
    expect(envelopeValueFromPoint('decayCurve', points.decayCurve.x, points.decayCurve.y, envelope)).toBeCloseTo(-.2)
    expect(envelopeValueFromPoint('releaseCurve', points.releaseCurve.x, points.releaseCurve.y, envelope)).toBeCloseTo(.3)
    expect((points.attackCurve.y - 29) / (3 - 29)).toBeCloseTo(envelopeCurvePosition(.5, envelope.attackCurve))
    expect((points.decayCurve.y - 3) / (points.decay.y - 3)).toBeCloseTo(envelopeCurvePosition(.5, envelope.decayCurve))
    expect((points.releaseCurve.y - points.decay.y) / (29 - points.decay.y)).toBeCloseTo(envelopeCurvePosition(.5, envelope.releaseCurve))
    expect(envelopeHandlePoints({ ...envelope, releaseSeconds: 7 }).sustain.x).toBe(points.sustain.x)
    expect(envelopeHandlePoints({ ...envelope, releaseSeconds: 7 }).release.x).toBeGreaterThan(points.release.x)
    expect(points.release.y).toBe(29)
    expect(points.attack.x).toBeLessThan(points.hold.x)
    expect(points.hold.x).toBeLessThan(points.decay.x)
    expect(points.sustain.y).toBe(points.decay.y)
    expect(points.sustain.x).toBeGreaterThan(points.decay.x)
    expect(points.sustain.x).toBeLessThan(points.release.x)
  })

  it.each(['attackCurve', 'decayCurve', 'releaseCurve'] as const)('round trips %s handle geometry through the shared curve evaluator', (handle) => {
    for (const curve of [-.8731, -.2467, 0, .0373, .6189, .9417]) {
      const next = { ...envelope, [handle]: curve }
      const point = envelopeHandlePoints(next)[handle]
      expect(envelopeValueFromPoint(handle, point.x, point.y, next)).toBeCloseTo(curve, 10)
    }
  })

  it('handles neutral, endpoint, and out-of-range curve positions', () => {
    const neutral = { ...envelope, attackCurve: 0 }
    const point = envelopeHandlePoints(neutral).attackCurve
    expect(envelopeValueFromPoint('attackCurve', point.x, point.y, neutral)).toBe(0)
    expect(envelopeValueFromPoint('attackCurve', point.x, -100, neutral)).toBe(-1)
    expect(envelopeValueFromPoint('attackCurve', point.x, 100, neutral)).toBe(1)
  })

  it('clamps values and hit tests visible handles', () => {
    expect(envelopeValueFromPoint('sustain', 50, -20, envelope)).toBe(1)
    expect(envelopeValueFromPoint('attack', -1000, 0, envelope)).toBe(0)
    expect(envelopeValueFromPoint('hold', -1000, 0, envelope)).toBe(0)
    expect(envelopeValueFromPoint('decay', -1000, 0, envelope)).toBe(0)
    expect(envelopeValueFromPoint('attack', 1000, 0, envelope)).toBe(3)
    const attack = envelopeHandlePoints(envelope).attack
    expect(hitTestEnvelopeHandle(envelope, attack.x, attack.y)).toBe('attack')
  })
})
