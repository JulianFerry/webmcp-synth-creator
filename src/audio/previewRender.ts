export interface SynthPreviewRequest {
  note: 'C3'
  velocity: number
  attackHoldSeconds: number
  sustainWindowSeconds: number
  includeRelease: true
  includeEffects: true
}

export interface SynthPreviewRender {
  samples: Float32Array
  sampleRate: number
  attackHoldEndSeconds: number
  sustainStartSeconds: number
  sustainEndSeconds: number
  releaseStartSeconds: number
  durationSeconds: number
}

export interface SynthPreviewRenderer {
  renderPreview(
    request: SynthPreviewRequest,
    signal: AbortSignal,
  ): Promise<SynthPreviewRender>
}

export const FIXED_C3_PREVIEW_REQUEST: SynthPreviewRequest = {
  note: 'C3',
  velocity: 0.85,
  attackHoldSeconds: 0.5,
  sustainWindowSeconds: 0.5,
  includeRelease: true,
  includeEffects: true,
}

export const FIXED_C3_MIDI = 48
export const PREVIEW_RENDER_DEBOUNCE_MS = 120
