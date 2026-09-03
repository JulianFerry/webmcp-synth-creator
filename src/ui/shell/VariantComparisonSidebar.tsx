import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react'

import { FIXED_C3_MIDI, FIXED_C3_PREVIEW_REQUEST } from '../../audio/previewRender'
import type { PatchState } from '../../patch/types'
import type { VariantId } from '../../session/SessionService'
import { VariantButton, type VariantSwitcherProps } from '../VariantSwitcher'
import { SIDEBAR_PATCH_COLORS } from '../colorThemes'
import {
  buildSpectralFingerprintSurface,
  drawSpectralFingerprint,
  SPECTRAL_FINGERPRINT_BANDS,
  SPECTRAL_FINGERPRINT_DURATION_SECONDS,
  SPECTRAL_FINGERPRINT_FRAMES,
  SPECTRAL_FINGERPRINT_NOTE_PRESS_SECONDS,
  SPECTRAL_FINGERPRINT_ROTATION_DEGREES,
  SPECTRAL_FINGERPRINT_TILT_DEGREES,
} from '../visualizations/spectralFingerprint'
import { VitalTransferControls } from './VitalTransferControls'

interface VariantComparisonSidebarProps {
  audition: {
    onNoteOff: (midi: number) => void
    onNoteOn: (midi: number, velocity?: number, requestedAtMs?: number) => Promise<void>
    onReleaseAll: () => void
  }
  canCopyBetweenVariants: boolean
  patches: { A: PatchState; B: PatchState | null }
  transfer: ComponentProps<typeof VitalTransferControls>
  variant: VariantSwitcherProps & {
    onCopyVariant: (sourceVariant: VariantId, targetVariant: VariantId) => void
  }
}

const VARIANT_PREVIEW_HOLD_MS =
  (FIXED_C3_PREVIEW_REQUEST.attackHoldSeconds + FIXED_C3_PREVIEW_REQUEST.sustainWindowSeconds) * 1_000

interface SpectrogramView {
  rotation: number
  tilt: number
}

function VariantSpectrogram({ patch, setView, variant, view }: { patch: PatchState | null; setView: (view: SpectrogramView) => void; variant: 'A' | 'B'; view: SpectrogramView }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ moved: boolean; pointerId: number; rotation: number; tilt: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const color = SIDEBAR_PATCH_COLORS[variant]
  const surface = useMemo(() => patch ? buildSpectralFingerprintSurface(patch) : null, [patch])
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
      drawSpectralFingerprint(context, surface, bounds.width, bounds.height, color.rgb, view)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [color.rgb, surface, view])

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    suppressClick.current = drag.current.moved
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.classList.remove('is-dragging')
  }

  const signature = patch ? JSON.stringify({
    cutoff: patch.filter.cutoffHz,
    delay: patch.effects.delay.mix,
    levels: patch.oscillators.map(({ enabled, level, wavetablePosition }) => [enabled, level, wavetablePosition]),
    name: patch.metadata.name,
    reverb: patch.effects.reverb.mix,
  }) : 'unavailable'
  return <canvas
    aria-label={`Variant ${variant} 3D time-frequency spectrogram over ${SPECTRAL_FINGERPRINT_DURATION_SECONDS} seconds at ${Math.round(view.rotation)} degrees rotation and ${Math.round(view.tilt)} degrees tilt with ${SPECTRAL_FINGERPRINT_FRAMES} time frames. Drag to rotate and tilt; double-click to reset.${patch ? '' : ' Unavailable.'}`}
    data-bins={SPECTRAL_FINGERPRINT_BANDS}
    data-color={color.hex}
    data-depth-lines={SPECTRAL_FINGERPRINT_FRAMES}
    data-duration-seconds={SPECTRAL_FINGERPRINT_DURATION_SECONDS}
    data-frequency-direction="left-to-right"
    data-line-style="solid ridgeline"
    data-note-press-seconds={SPECTRAL_FINGERPRINT_NOTE_PRESS_SECONDS}
    data-rotation-degrees={Math.round(view.rotation)}
    data-spectral-signature={signature}
    data-testid={`variant-${variant.toLowerCase()}-spectrogram`}
    data-tilt-degrees={Math.round(view.tilt)}
    data-time-direction="back-to-front"
    onClick={(event) => {
      if (!suppressClick.current) return
      event.stopPropagation()
      suppressClick.current = false
    }}
    onDoubleClick={(event) => {
      event.stopPropagation()
      suppressClick.current = false
      setView({ rotation: SPECTRAL_FINGERPRINT_ROTATION_DEGREES, tilt: SPECTRAL_FINGERPRINT_TILT_DEGREES })
    }}
    onPointerCancel={endDrag}
    onPointerDown={(event) => {
      drag.current = { moved: false, pointerId: event.pointerId, rotation: view.rotation, tilt: view.tilt, x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('is-dragging')
    }}
    onPointerMove={(event) => {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return
      const x = event.clientX - drag.current.x
      const y = event.clientY - drag.current.y
      if (Math.hypot(x, y) > 3) drag.current.moved = true
      setView({
        rotation: Math.max(-80, Math.min(80, drag.current.rotation + x * 0.35)),
        tilt: Math.max(4, Math.min(82, drag.current.tilt - y * 0.35)),
      })
    }}
    onPointerUp={endDrag}
    ref={ref}
    role="img"
  />
}

export function VariantComparisonSidebar({ audition, canCopyBetweenVariants, patches, transfer, variant }: VariantComparisonSidebarProps) {
  const { onNoteOff, onNoteOn, onReleaseAll } = audition
  const [spectrogramView, setSpectrogramView] = useState<SpectrogramView>({ rotation: SPECTRAL_FINGERPRINT_ROTATION_DEGREES, tilt: SPECTRAL_FINGERPRINT_TILT_DEGREES })
  const previewGeneration = useRef(0)
  const previewTimer = useRef<number | null>(null)
  const previewedVariant = useRef<VariantId | null>(null)
  const activateVariant = (variantId: 'A' | 'B') => {
    if (variantId === 'B' && !variant.hasVariantB) variant.onCreateVariant()
    else variant.onSelectVariant(variantId)
  }

  const stopVariantPreview = useCallback(() => {
    previewGeneration.current += 1
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
    previewTimer.current = null
    if (previewedVariant.current !== null) onNoteOff(FIXED_C3_MIDI)
    previewedVariant.current = null
  }, [onNoteOff])

  const previewVariant = (variantId: VariantId) => {
    if (!patches[variantId]) return
    stopVariantPreview()
    onReleaseAll()
    variant.onSelectVariant(variantId)
    const generation = previewGeneration.current
    previewedVariant.current = variantId
    void onNoteOn(
      FIXED_C3_MIDI,
      FIXED_C3_PREVIEW_REQUEST.velocity,
      performance.now(),
    ).then(() => {
      if (previewGeneration.current !== generation) {
        if (previewedVariant.current === null) onNoteOff(FIXED_C3_MIDI)
        return
      }
      previewTimer.current = window.setTimeout(() => {
        if (previewGeneration.current !== generation) return
        onNoteOff(FIXED_C3_MIDI)
        previewTimer.current = null
        previewedVariant.current = null
      }, VARIANT_PREVIEW_HOLD_MS)
    }).catch(() => {
      if (previewGeneration.current !== generation) return
      onNoteOff(FIXED_C3_MIDI)
      previewTimer.current = null
      previewedVariant.current = null
    })
  }

  useEffect(() => {
    if (previewedVariant.current !== null && previewedVariant.current !== variant.currentVariant) {
      stopVariantPreview()
    }
  }, [stopVariantPreview, variant.currentVariant])

  useEffect(() => stopVariantPreview, [stopVariantPreview])

  return <aside aria-label="Variant comparison" className="workbench-sidebar">
    <h1 className="sidebar-title"><span>SYNTH</span> <strong>CREATOR</strong></h1>
    <VitalTransferControls {...transfer} />
    <section className="variant-comparison">
      <div className="sidebar-section-heading"><span>A/B compare</span><strong>A / B</strong></div>
      <div className="variant-spectrogram-grid">
        {(['A', 'B'] as const).map((variantId) => <div className={`variant-comparison-card variant-comparison-card-${variantId.toLowerCase()}`} key={variantId}>
          <VariantButton {...variant} variantId={variantId} />
          <article
          aria-label={`${variantId === 'B' && !variant.hasVariantB ? 'Create' : 'Select'} patch variant ${variantId} from comparison`}
          className={`variant-spectrum variant-spectrum-${variantId.toLowerCase()}`}
          data-available={Boolean(patches[variantId])}
          data-selected={variant.currentVariant === variantId}
          onClick={() => activateVariant(variantId)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            activateVariant(variantId)
          }}
          role="button"
          tabIndex={0}
        >
          <VariantSpectrogram patch={patches[variantId]} setView={setSpectrogramView} variant={variantId} view={spectrogramView} />
          </article>
          <div className="variant-card-actions">
            <button
              aria-label={`Preview variant ${variantId} with a one-second C3`}
              className="button variant-card-action"
              data-testid={`preview-variant-${variantId.toLowerCase()}`}
              disabled={!patches[variantId]}
              onClick={() => previewVariant(variantId)}
              type="button"
            >Preview</button>
            <button
              aria-label={`Copy variant ${variantId} to variant ${variantId === 'A' ? 'B' : 'A'}`}
              className="button variant-card-action"
              data-testid={`copy-variant-${variantId.toLowerCase()}-to-${variantId === 'A' ? 'b' : 'a'}`}
              disabled={!patches[variantId] || (Boolean(patches.B) && !canCopyBetweenVariants)}
              onClick={() => variant.onCopyVariant(variantId, variantId === 'A' ? 'B' : 'A')}
              title={!patches[variantId] ? `Variant ${variantId} does not exist yet` : undefined}
              type="button"
            >Copy to {variantId === 'A' ? 'B' : 'A'}</button>
          </div>
        </div>)}
      </div>
    </section>
  </aside>
}
