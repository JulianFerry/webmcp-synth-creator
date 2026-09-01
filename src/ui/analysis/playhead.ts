import type { SynthPreviewRender } from '../../audio/previewRender'

export interface PreviewNoteTiming {
  noteOnSeconds: number
  noteOffSeconds: number | null
}

export function previewPlayheadPosition(
  render: SynthPreviewRender,
  timing: PreviewNoteTiming | null,
  nowSeconds: number,
): number | null {
  if (!timing || nowSeconds < timing.noteOnSeconds) return null
  const heldElapsed = nowSeconds - timing.noteOnSeconds
  let renderSeconds: number
  if (timing.noteOffSeconds === null || nowSeconds < timing.noteOffSeconds) {
    if (heldElapsed < render.sustainStartSeconds) renderSeconds = heldElapsed
    else {
      const sustainDuration = render.sustainEndSeconds - render.sustainStartSeconds
      renderSeconds = sustainDuration > 0
        ? render.sustainStartSeconds + ((heldElapsed - render.sustainStartSeconds) % sustainDuration)
        : render.sustainStartSeconds
    }
  } else {
    const releaseElapsed = nowSeconds - timing.noteOffSeconds
    renderSeconds = render.releaseStartSeconds + releaseElapsed
  }
  if (renderSeconds > render.durationSeconds) return null
  return Math.max(0, Math.min(1, renderSeconds / render.durationSeconds))
}
