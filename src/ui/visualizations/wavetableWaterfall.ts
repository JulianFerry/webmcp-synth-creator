import type { WavetableState } from '../../patch/types'
import { renderWavetableFrame } from '../../wavetables/render'
import { projectIsometricPoint, type PerspectiveViewport, type ProjectedPoint } from './perspective'

export interface WavetableWaterfallProjection {
  lines: ProjectedPoint[][]
  marker: { start: ProjectedPoint; end: ProjectedPoint; frame: number }
}

export function projectWavetableWaterfall(
  wavetable: WavetableState,
  position: number,
  viewport: PerspectiveViewport,
  sampleCount = 48,
): WavetableWaterfallProjection {
  const frames = wavetable.frames.map((frame) => renderWavetableFrame(frame, sampleCount))
  const depths = Math.max(1, frames.length)
  const lines = frames.map((samples, depth) => [...samples].map((sample, column) =>
    projectIsometricPoint(column, depth, (sample + 1) / 2, samples.length, depths, viewport),
  ))
  const frame = frames.length <= 1 ? 0 : Math.max(0, Math.min(frames.length - 1, position * (frames.length - 1)))
  const start = projectIsometricPoint(0, frame, 0, sampleCount, depths, viewport)
  const end = projectIsometricPoint(sampleCount - 1, frame, 0, sampleCount, depths, viewport)
  return { lines, marker: { start, end, frame } }
}
