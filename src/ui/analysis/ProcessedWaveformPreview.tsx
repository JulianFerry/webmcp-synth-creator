import { useEffect, useRef, useState } from 'react'

import type { SynthPreviewRender } from '../../audio/previewRender'
import { buildMinMaxWaveformPath } from '../visualizations/waveform'
import { previewPlayheadPosition, type PreviewNoteTiming } from './playhead'

interface ProcessedWaveformPreviewProps {
  activeVoiceCount: number
  error: string | null
  pending: boolean
  render: SynthPreviewRender | null
  renderId: number
}

export function ProcessedWaveformPreview({ activeVoiceCount, error, pending, render, renderId }: ProcessedWaveformPreviewProps) {
  const timing = useRef<PreviewNoteTiming | null>(null)
  const previousVoiceCount = useRef(0)
  const [playhead, setPlayhead] = useState<number | null>(null)

  useEffect(() => {
    const now = performance.now() / 1_000
    if (activeVoiceCount > 0 && previousVoiceCount.current === 0) timing.current = { noteOnSeconds: now, noteOffSeconds: null }
    if (activeVoiceCount === 0 && previousVoiceCount.current > 0 && timing.current) timing.current.noteOffSeconds = now
    previousVoiceCount.current = activeVoiceCount
  }, [activeVoiceCount])

  useEffect(() => {
    if (!render) return
    let frame = 0
    const update = () => {
      setPlayhead(previewPlayheadPosition(render, timing.current, performance.now() / 1_000))
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [render])

  const path = render ? buildMinMaxWaveformPath(render.samples) : ''
  return <section className="panel processed-waveform-panel" aria-label="C3 processed preview" data-preview-render-id={renderId}>
    <header className="panel-heading">
      <div><p className="eyebrow">Signal analysis / fixed note</p><h2>C3 processed preview</h2></div>
      <span className="live-indicator">{pending ? 'Rendering' : render ? `Render ${renderId}` : 'Waiting'}</span>
    </header>
    <figure className="processed-waveform-figure">
      <svg viewBox="0 0 100 48" role="img" aria-label="Effects-inclusive C3 waveform">
        <path className="plot-grid" d="M0 12H100M0 24H100M0 36H100M25 0V48M50 0V48M75 0V48" />
        <path className="processed-waveform-path" data-testid="processed-waveform-path" d={path} />
        {playhead !== null ? <line className="processed-waveform-playhead" x1={playhead * 100} x2={playhead * 100} y1="0" y2="48" /> : null}
      </svg>
      <figcaption><span>C3 · velocity 85%</span><strong>{error ?? (render ? `${render.durationSeconds.toFixed(2)}s / FX included` : 'Preparing deterministic render')}</strong></figcaption>
    </figure>
  </section>
}
