export interface ProjectedPoint { x: number; y: number }

export interface PerspectiveViewport { width: number; height: number; padding?: number }

export function projectIsometricPoint(
  column: number,
  depth: number,
  value: number,
  columns: number,
  depths: number,
  viewport: PerspectiveViewport,
): ProjectedPoint {
  const padding = viewport.padding ?? 12
  const usableWidth = Math.max(0, viewport.width - padding * 2)
  const usableHeight = Math.max(0, viewport.height - padding * 2)
  const depthTravelX = usableWidth * 0.22
  const depthTravelY = usableHeight * 0.36
  const xRatio = columns <= 1 ? 0.5 : column / (columns - 1)
  const depthRatio = depths <= 1 ? 0 : depth / (depths - 1)
  return {
    x: padding + depthTravelX * depthRatio + xRatio * (usableWidth - depthTravelX),
    y: padding + depthTravelY * depthRatio + (1 - Math.max(0, Math.min(1, value))) * (usableHeight - depthTravelY),
  }
}

export function depthShade(depth: number, depths: number): number {
  if (depths <= 1) return 1
  return 0.35 + 0.65 * (depth / (depths - 1))
}
