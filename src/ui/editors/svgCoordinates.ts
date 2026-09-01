export interface SvgPoint {
  x: number
  y: number
}

export function clientPointToSvg(svg: SVGSVGElement, clientX: number, clientY: number): SvgPoint {
  const matrix = svg.getScreenCTM()
  if (matrix) {
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    return point.matrixTransform(matrix.inverse())
  }

  const rect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  return {
    x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
    y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
  }
}
