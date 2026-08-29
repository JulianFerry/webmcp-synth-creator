import { describe, expect, it } from 'vitest'

import {
  evaluateModulationFrame,
  modulationSignal,
  scheduleModulationRange,
  type ModulationFrame,
} from '../../src/audio/ModulationScheduler'
import { midiToHz } from '../../src/audio/units'
import { MODULATION_DESTINATIONS_BY_SOURCE } from '../../src/patch/modulation'
import { createDefaultPatch } from '../../src/patch/defaults'
import { parsePatchState } from '../../src/patch/schemas'
import type { ModulationRoute } from '../../src/patch/types'

describe('closed modulation matrix', () => {
  it('accepts every declared source-destination pair', () => {
    let count = 0
    for (const [source, destinations] of Object.entries(MODULATION_DESTINATIONS_BY_SOURCE)) {
      for (const destination of destinations) {
        const patch = createDefaultPatch()
        patch.modulations = [
          {
            id: `route-${count}`,
            source,
            destination,
            amount: 0.25,
            bipolar: false,
          } as ModulationRoute,
        ]
        expect(parsePatchState(patch).modulations[0]).toMatchObject({ source, destination })
        count += 1
      }
    }
    expect(count).toBe(20)
  })

  it('rejects unknown route members and duplicate route pairs', () => {
    const unknownSource = createDefaultPatch() as any
    unknownSource.modulations[0].source = 'macro1'
    expect(() => parsePatchState(unknownSource)).toThrow()

    const unknownDestination = createDefaultPatch() as any
    unknownDestination.modulations[0].destination = 'filter.warmth'
    expect(() => parsePatchState(unknownDestination)).toThrow()

    const duplicate = createDefaultPatch()
    duplicate.modulations.push({ ...duplicate.modulations[0], id: 'duplicate-id' })
    expect(() => parsePatchState(duplicate)).toThrow(/Duplicate modulation route/)
  })
})

describe('modulation routing values', () => {
  it('converts unipolar and bipolar signals and modulates quadratic level in Vital direction', () => {
    expect(modulationSignal(0, false)).toBe(0)
    expect(modulationSignal(1, false)).toBe(1)
    expect(modulationSignal(0, true)).toBe(-0.5)
    expect(modulationSignal(0.5, true)).toBe(0)
    expect(modulationSignal(1, true)).toBe(0.5)

    const patch = createDefaultPatch()
    const low = evaluateModulationFrame(patch, 60, 0)
    const high = evaluateModulationFrame(patch, 60, 0.005)
    expect(low.lfoValue).toBe(0)
    expect(high.lfoValue).toBeCloseTo(1)
    expect(low.oscillatorLevels[0]).toBeCloseTo(0.62)
    expect(high.oscillatorLevels[0]).toBe(2)
    expect(low.filterCutoffHz).toBe(7_200)
    expect(high.filterCutoffHz).toBeCloseTo(7_200 * 2 ** ((0.12 * 128) / 12))
    expect(low.oscillatorLevels[0]).toBeLessThan(high.oscillatorLevels[0])
  })

  it('stops LFO modulation when disabled without removing its shape, rate, or routes', () => {
    const patch = createDefaultPatch()
    const retained = {
      points: structuredClone(patch.lfo1.points),
      rate: structuredClone(patch.lfo1.rate),
      routes: structuredClone(patch.modulations),
    }
    patch.lfo1.enabled = false

    const frame = evaluateModulationFrame(patch, 60, 0)

    expect(frame.oscillatorLevels[0]).toBeCloseTo(patch.oscillators[0].level)
    expect(frame.filterCutoffHz).toBe(patch.filter.cutoffHz)
    expect(patch.lfo1.points).toEqual(retained.points)
    expect(patch.lfo1.rate).toEqual(retained.rate)
    expect(patch.modulations).toEqual(retained.routes)
  })

  it('applies bipolar pitch amounts and schedules a deterministic look-ahead range', () => {
    const patch = createDefaultPatch()
    patch.lfo1 = {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      rate: { mode: 'free', hz: 1 },
      phase: 0,
      smooth: false,
    }
    patch.modulations = [
      {
        id: 'pitch-route',
        source: 'lfo1',
        destination: 'oscillator1.pitch',
        amount: 1,
        bipolar: true,
      },
    ]
    const frame = evaluateModulationFrame(patch, 60, 0.25)
    expect(frame.oscillatorFrequencies[0]).toBeCloseTo(midiToHz(59.5), 5)

    const frames: Array<{ frame: ModulationFrame; time: number }> = []
    const count = scheduleModulationRange(patch, 60, 0, 0, 0.1, {
      applyModulationFrame(nextFrame, time) {
        frames.push({ frame: nextFrame, time })
      },
      resetModulation() {
        return
      },
    })
    expect(count).toBe(6)
    expect(frames.map(({ time }) => Number(time.toFixed(2)))).toEqual([
      0,
      0.02,
      0.04,
      0.06,
      0.08,
      0.1,
    ])
  })
})
