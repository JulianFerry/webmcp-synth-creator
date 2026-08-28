export interface ParameterScale {
  toPosition(value: number, minimum: number, maximum: number): number
  fromPosition(position: number, minimum: number, maximum: number): number
}

interface LogarithmicParameterScaleOptions {
  quantize?: (value: number) => number
}

export type ParameterScaleNavigationKey =
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'End'
  | 'Home'
  | 'PageDown'
  | 'PageUp'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function assertRange(minimum: number, maximum: number): void {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    throw new RangeError('Parameter scale requires a finite increasing range')
  }
}

export function createLogarithmicParameterScale(
  options: LogarithmicParameterScaleOptions = {},
): ParameterScale {
  const quantize = options.quantize ?? ((value: number) => Number(value.toPrecision(12)))

  return {
    toPosition(value, minimum, maximum) {
      assertRange(minimum, maximum)
      if (minimum <= 0) {
        throw new RangeError('Logarithmic parameter scale requires a positive range')
      }
      const boundedValue = clamp(value, minimum, maximum)
      return Math.log(boundedValue / minimum) / Math.log(maximum / minimum)
    },

    fromPosition(position, minimum, maximum) {
      assertRange(minimum, maximum)
      if (minimum <= 0) {
        throw new RangeError('Logarithmic parameter scale requires a positive range')
      }
      const boundedPosition = clamp(position, 0, 1)
      if (boundedPosition === 0) return minimum
      if (boundedPosition === 1) return maximum
      const value = minimum * (maximum / minimum) ** boundedPosition
      return clamp(quantize(value), minimum, maximum)
    },
  }
}

export const LOGARITHMIC_PARAMETER_SCALE = createLogarithmicParameterScale()

export const WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE = createLogarithmicParameterScale({
  quantize: Math.round,
})

export function parameterValueToControlValue(
  value: number,
  minimum: number,
  maximum: number,
  scale: ParameterScale,
): number {
  const position = clamp(scale.toPosition(value, minimum, maximum), 0, 1)
  return minimum + position * (maximum - minimum)
}

export function controlValueToParameterValue(
  controlValue: number,
  minimum: number,
  maximum: number,
  scale: ParameterScale,
): number {
  assertRange(minimum, maximum)
  const position = (clamp(controlValue, minimum, maximum) - minimum) / (maximum - minimum)
  return scale.fromPosition(position, minimum, maximum)
}

export function navigateParameterScale(
  value: number,
  minimum: number,
  maximum: number,
  scale: ParameterScale,
  key: ParameterScaleNavigationKey,
  positionStep: number,
): number {
  if (!Number.isFinite(positionStep) || positionStep <= 0) {
    throw new RangeError('Parameter scale navigation requires a positive finite step')
  }
  if (key === 'Home') return minimum
  if (key === 'End') return maximum

  const direction =
    key === 'ArrowDown' || key === 'ArrowLeft' || key === 'PageDown' ? -1 : 1
  const distance = key === 'PageDown' || key === 'PageUp' ? positionStep * 10 : positionStep
  const position = scale.toPosition(value, minimum, maximum)
  return scale.fromPosition(position + direction * distance, minimum, maximum)
}
