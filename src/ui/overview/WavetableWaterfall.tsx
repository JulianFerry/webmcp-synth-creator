import { useEffect, useRef } from 'react'

import type { WavetableState } from '../../patch/types'
import { observePatchTheme, themedGraphColor, themedGraphEndColor } from '../colorThemes'
import { OSCILLATOR_PLOT_INSET_RATIO, projectWavetableWaterfall } from '../visualizations/wavetableWaterfall'

interface WavetableWaterfallProps { number: number; position: number; wavetable: WavetableState; direction?: 'left' | 'right' }

export function WavetableWaterfall({ number, position, wavetable, direction = 'left' }: WavetableWaterfallProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const context = canvas.getContext('2d')
      if (!context) return
      const bounds = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(bounds.width * ratio))
      canvas.height = Math.max(1, Math.round(bounds.height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, bounds.width, bounds.height)
      const projection = projectWavetableWaterfall(wavetable, position, bounds, 96, 64, direction)
      const graphColor = themedGraphColor(canvas)
      const graphEndColor = themedGraphEndColor()
      const endRgb = graphEndColor?.rgb ?? [213, 218, 224]
      canvas.dataset.graphColor = graphColor?.hex ?? 'mixed'
      canvas.dataset.plotLeft = String(projection.plotBounds.left)
      canvas.dataset.plotRight = String(projection.plotBounds.right)
      canvas.dataset.plotWidth = String(projection.plotBounds.width)
      projection.lines.forEach((line, index) => {
        const depth = index / Math.max(1, projection.lines.length - 1)
        const red = graphColor ? Math.round(graphColor.rgb[0] + (endRgb[0] - graphColor.rgb[0]) * depth) : Math.round(69 + (255 - 69) * depth)
        const green = graphColor ? Math.round(graphColor.rgb[1] + (endRgb[1] - graphColor.rgb[1]) * depth) : Math.round(200 + (159 - 200) * depth)
        const blue = graphColor ? Math.round(graphColor.rgb[2] + (endRgb[2] - graphColor.rgb[2]) * depth) : Math.round(189 + (74 - 189) * depth)
        context.beginPath()
        line.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y))
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.58)`
        context.lineWidth = 0.85
        context.stroke()
      })
      context.beginPath()
      projection.selectedLine.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y))
      const graphEnd = graphEndColor ?? { hex: '#d5dae0', rgb: [213, 218, 224] as const }
      canvas.dataset.graphEndColor = graphEnd.hex
      canvas.dataset.selectedLineColor = '#ffffff'
      context.strokeStyle = 'rgba(255, 255, 255, 0.96)'
      context.lineWidth = 1.7
      context.shadowColor = 'rgba(231, 237, 244, 0.65)'
      context.shadowBlur = 4
      context.stroke()
      context.shadowBlur = 0
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    const disconnectThemeObserver = observePatchTheme(canvas, draw)
    return () => {
      disconnectThemeObserver()
      observer.disconnect()
    }
  }, [direction, position, wavetable])
  return <canvas ref={ref} role="img" aria-label={`Oscillator ${number} ${wavetable.name} wavetable waterfall at ${Math.round(position * 100)} percent, projected diagonally ${direction}; selected waveform is highlighted in soft white`} data-graph-end-color="#d5dae0" data-testid={`oscillator-${number}-waterfall`} data-visible-plot-inset-percent={OSCILLATOR_PLOT_INSET_RATIO * 100} data-position={position} />
}
