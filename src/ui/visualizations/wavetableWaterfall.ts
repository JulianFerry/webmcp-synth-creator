import type { WavetableState } from '../../patch/types'
import { renderWavetablePosition } from '../../wavetables/render'
import type { PerspectiveViewport, ProjectedPoint } from './perspective'

export interface WavetableWaterfallProjection {
  lines: ProjectedPoint[][]
  selectedLine: ProjectedPoint[]
  marker: { frame: number; line: number }
  plotBounds: { left: number; right: number; width: number }
}

export const OSCILLATOR_PLOT_INSET_RATIO = 0.02
export const WAVETABLE_DEPTH_ROTATION_RATIO = 0.14
export const WAVETABLE_FREQUENCY_TILT_RATIO = 0.055
export const WAVETABLE_HEIGHT_RATIO = 0.11

export function projectWavetableWaterfall(
  wavetable: WavetableState,
  position: number,
  viewport: PerspectiveViewport,
  sampleCount = 96,
  lineCount = 64,
  direction: 'left' | 'right' = 'left',
  insetRatio = OSCILLATOR_PLOT_INSET_RATIO,
): WavetableWaterfallProjection {
  const paddingY = Math.min(16, Math.max(9, viewport.height * 0.1))
  const depthTravelX = Math.min(36, Math.max(18, viewport.width * WAVETABLE_DEPTH_ROTATION_RATIO))
  const waveformTiltY = viewport.height * WAVETABLE_FREQUENCY_TILT_RATIO
  const waveformHeight = viewport.height * WAVETABLE_HEIGHT_RATIO
  const verticalInset = paddingY + waveformHeight + Math.abs(waveformTiltY) / 2
  const usableHeight = Math.max(1, viewport.height - verticalInset * 2)
  const steps = Math.max(2, lineCount)
  const stepY = usableHeight / (steps - 1)
  const skew = depthTravelX / (steps - 1)
  const insetX = Math.max(0, viewport.width * insetRatio)
  const plotWidth = Math.max(1, viewport.width - insetX * 2)
  const waveformWidth = Math.max(1, plotWidth - depthTravelX)
  const normalizedPosition = Math.max(0, Math.min(1, position))

  const lines = Array.from({ length: steps }, (_, line) => {
    const tablePosition = line / (steps - 1)
    const samples = renderWavetablePosition(wavetable, tablePosition, sampleCount)
    const xOrigin = insetX + (direction === 'right' ? line : steps - 1 - line) * skew
    const yOrigin = verticalInset + (steps - 1 - line) * stepY
    return Array.from(samples, (sample, column) => ({
      x: xOrigin + (column / Math.max(1, samples.length - 1)) * waveformWidth,
      y: yOrigin + (column / Math.max(1, samples.length - 1) - 0.5) * waveformTiltY - sample * waveformHeight,
    }))
  })
  const line = Math.round(normalizedPosition * (steps - 1))
  const frame = wavetable.frames.length <= 1
    ? 0
    : Math.round(normalizedPosition * (wavetable.frames.length - 1))
  return {
    lines,
    selectedLine: lines[line],
    marker: { frame, line },
    plotBounds: { left: insetX, right: insetX + plotWidth, width: plotWidth },
  }
}
