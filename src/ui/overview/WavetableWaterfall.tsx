import { useEffect, useRef } from 'react'

import type { WavetableState } from '../../patch/types'
import { depthShade } from '../visualizations/perspective'
import { projectWavetableWaterfall } from '../visualizations/wavetableWaterfall'

interface WavetableWaterfallProps { number: number; position: number; wavetable: WavetableState }

export function WavetableWaterfall({ number, position, wavetable }: WavetableWaterfallProps) {
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
      const projection = projectWavetableWaterfall(wavetable, position, bounds)
      projection.lines.forEach((line, depth) => {
        context.beginPath()
        line.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y))
        context.strokeStyle = `rgba(69, 200, 189, ${depthShade(depth, projection.lines.length)})`
        context.lineWidth = 1
        context.stroke()
      })
      context.beginPath()
      context.moveTo(projection.marker.start.x, projection.marker.start.y)
      context.lineTo(projection.marker.end.x, projection.marker.end.y)
      context.strokeStyle = '#ff9f4a'
      context.lineWidth = 2
      context.stroke()
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [position, wavetable])
  return <canvas ref={ref} role="img" aria-label={`Oscillator ${number} ${wavetable.name} wavetable waterfall at ${Math.round(position * 100)} percent`} data-testid={`oscillator-${number}-waterfall`} data-position={position} />
}
