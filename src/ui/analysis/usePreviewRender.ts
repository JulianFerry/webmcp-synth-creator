import { useEffect, useState } from 'react'

import {
  FIXED_C3_PREVIEW_REQUEST,
  PREVIEW_RENDER_DEBOUNCE_MS,
  type SynthPreviewRender,
  type SynthPreviewRenderer,
} from '../../audio/previewRender'
import type { SessionService } from '../../session/SessionService'

export interface PreviewRenderState {
  render: SynthPreviewRender | null
  renderId: number
  pending: boolean
  error: string | null
}

export function usePreviewRender(
  renderer: SynthPreviewRenderer | null,
  session: SessionService | null,
): PreviewRenderState {
  const [state, setState] = useState<PreviewRenderState>({ render: null, renderId: 0, pending: false, error: null })

  useEffect(() => {
    if (!renderer) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null
    let disposed = false
    const schedule = () => {
      if (timer) clearTimeout(timer)
      controller?.abort()
      setState((current) => ({ ...current, pending: true, error: null }))
      timer = setTimeout(() => {
        timer = null
        controller = new AbortController()
        const activeController = controller
        void renderer.renderPreview(FIXED_C3_PREVIEW_REQUEST, activeController.signal)
          .then((render) => {
            if (disposed || activeController.signal.aborted) return
            setState((current) => ({ render, renderId: current.renderId + 1, pending: false, error: null }))
          })
          .catch((error: unknown) => {
            if (disposed || activeController.signal.aborted) return
            setState((current) => ({ ...current, pending: false, error: error instanceof Error ? error.message : 'Preview render failed' }))
          })
      }, PREVIEW_RENDER_DEBOUNCE_MS)
    }
    schedule()
    const unsubscribe = session?.subscribe(schedule)
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      controller?.abort()
      unsubscribe?.()
    }
  }, [renderer, session])

  return state
}
