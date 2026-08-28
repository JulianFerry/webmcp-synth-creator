import { describe, expect, it } from 'vitest'

import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../../src/patch/limits'
import {
  controlValueToParameterValue,
  LOGARITHMIC_PARAMETER_SCALE,
  navigateParameterScale,
  parameterValueToControlValue,
  WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE,
} from '../../src/ui/controls/parameterScale'

describe('logarithmic parameter scale', () => {
  const minimum = FILTER_CUTOFF_MIN_HZ
  const maximum = FILTER_CUTOFF_MAX_HZ
  const controlMidpoint = (minimum + maximum) / 2
  const geometricMidpoint = Math.sqrt(minimum * maximum)

  it('maps the schema endpoints and physical midpoint into frequency space', () => {
    expect(controlValueToParameterValue(minimum, minimum, maximum, LOGARITHMIC_PARAMETER_SCALE)).toBe(
      minimum,
    )
    expect(controlValueToParameterValue(maximum, minimum, maximum, LOGARITHMIC_PARAMETER_SCALE)).toBe(
      maximum,
    )
    expect(
      controlValueToParameterValue(
        controlMidpoint,
        minimum,
        maximum,
        LOGARITHMIC_PARAMETER_SCALE,
      ),
    ).toBeCloseTo(geometricMidpoint, 9)
    expect(geometricMidpoint).not.toBe((minimum + maximum) / 2)
  })

  it('round-trips canonical frequencies through their visual control positions', () => {
    for (const frequency of [minimum, geometricMidpoint, 1_000, 7_200, maximum]) {
      const controlValue = parameterValueToControlValue(
        frequency,
        minimum,
        maximum,
        LOGARITHMIC_PARAMETER_SCALE,
      )
      expect(
        controlValueToParameterValue(
          controlValue,
          minimum,
          maximum,
          LOGARITHMIC_PARAMETER_SCALE,
        ),
      ).toBeCloseTo(frequency, 8)
    }
  })

  it('rejects invalid logarithmic ranges rather than producing unusable controls', () => {
    expect(() => LOGARITHMIC_PARAMETER_SCALE.toPosition(0, 0, maximum)).toThrow(
      'positive range',
    )
    expect(() => LOGARITHMIC_PARAMETER_SCALE.fromPosition(0.5, maximum, minimum)).toThrow(
      'finite increasing range',
    )
  })

  it('maps whole-number frequency endpoints and the physical midpoint exactly', () => {
    const expectedMidpoint = Math.round(geometricMidpoint)

    expect(
      controlValueToParameterValue(
        minimum,
        minimum,
        maximum,
        WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE,
      ),
    ).toBe(minimum)
    expect(
      controlValueToParameterValue(
        controlMidpoint,
        minimum,
        maximum,
        WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE,
      ),
    ).toBe(expectedMidpoint)
    expect(
      controlValueToParameterValue(
        maximum,
        minimum,
        maximum,
        WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE,
      ),
    ).toBe(maximum)

    for (const position of [0, 0.001, 0.125, 0.5, 0.875, 0.999, 1]) {
      expect(
        Number.isInteger(
          WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE.fromPosition(
            position,
            minimum,
            maximum,
          ),
        ),
      ).toBe(true)
    }
  })

  it('uses logarithmic whole-Hz Arrow/Page navigation with exact Home/End bounds', () => {
    const scale = WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE
    const start = 1_000
    const arrowDown = navigateParameterScale(start, minimum, maximum, scale, 'ArrowLeft', 0.01)
    const arrowUp = navigateParameterScale(start, minimum, maximum, scale, 'ArrowRight', 0.01)
    const pageDown = navigateParameterScale(start, minimum, maximum, scale, 'PageDown', 0.01)
    const pageUp = navigateParameterScale(start, minimum, maximum, scale, 'PageUp', 0.01)

    expect(arrowDown).toBe(Math.round(start / 10 ** 0.03))
    expect(arrowUp).toBe(Math.round(start * 10 ** 0.03))
    expect(pageDown).toBe(Math.round(start / 10 ** 0.3))
    expect(pageUp).toBe(Math.round(start * 10 ** 0.3))
    expect(navigateParameterScale(start, minimum, maximum, scale, 'Home', 0.01)).toBe(minimum)
    expect(navigateParameterScale(start, minimum, maximum, scale, 'End', 0.01)).toBe(maximum)
    expect([arrowDown, arrowUp, pageDown, pageUp].every(Number.isInteger)).toBe(true)
  })
})
