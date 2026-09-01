import { useEffect, useMemo, useRef } from 'react'

import type { SynthPreviewRender } from '../../audio/previewRender'
import { observePatchTheme, themedGraphColor } from '../colorThemes'
import { depthShade, projectIsometricPoint } from '../visualizations/perspective'
import { buildSpectrogramGrid } from '../visualizations/spectrogram'

interface SpectrogramWaterfallProps {
  render: SynthPreviewRender | null
}

export function SpectrogramWaterfall({ render }: SpectrogramWaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grid = useMemo(() => render ? buildSpectrogramGrid(render.samples, render.sampleRate) : null, [render])

  useEffect(() => {
    const canvas = canvasRef.current
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
      if (!grid) return
      const graphColor = themedGraphColor(canvas)
      const [red, green, blue] = graphColor?.rgb ?? [69, 200, 189]
      canvas.dataset.graphColor = graphColor?.hex ?? '#45c8bd'

      for (let depth = 0; depth < grid.windows; depth += 1) {
        context.beginPath()
        for (let bin = 0; bin < grid.bins; bin += 1) {
          const magnitude = grid.magnitudes[depth * grid.bins + bin] ?? 0
          const point = projectIsometricPoint(bin, depth, magnitude, grid.bins, grid.windows, bounds)
          if (bin === 0) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        }
        const shade = depthShade(depth, grid.windows)
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${shade})`
        context.lineWidth = 1 + shade * 0.45
        context.stroke()
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    const disconnectThemeObserver = observePatchTheme(canvas, draw)
    return () => {
      disconnectThemeObserver()
      observer.disconnect()
    }
  }, [grid])

  return <section className="panel spectrogram-panel" aria-label="C3 spectral waterfall">
    <header className="panel-heading">
      <div><p className="eyebrow">Frequency analysis / sampled</p><h2>Spectral waterfall</h2></div>
      <span className="live-indicator">{grid ? `${grid.windows} × ${grid.bins}` : 'Waiting'}</span>
    </header>
    <figure className="spectrogram-figure">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Effects-inclusive C3 spectrogram waterfall"
        data-spectrogram-windows={grid?.windows ?? 0}
        data-spectrogram-bins={grid?.bins ?? 0}
        data-spectrogram-signature={grid ? [...grid.magnitudes].reduce((sum, value, index) => sum + value * (index + 1), 0).toFixed(4) : '0'}
      />
      <figcaption><span>Time / depth</span><strong>{grid ? `0–${Math.round(grid.maxFrequencyHz / 1_000)} kHz` : 'Preparing spectral grid'}</strong></figcaption>
    </figure>
  </section>
}
