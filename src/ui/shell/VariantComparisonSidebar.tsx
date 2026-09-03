import { useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react'

import type { PatchState } from '../../patch/types'
import { VariantButton, type VariantSwitcherProps } from '../VariantSwitcher'
import { SIDEBAR_PATCH_COLORS } from '../colorThemes'
import {
  buildSpectralFingerprintSurface,
  drawSpectralFingerprint,
  SPECTRAL_FINGERPRINT_BANDS,
  SPECTRAL_FINGERPRINT_FRAMES,
  SPECTRAL_FINGERPRINT_ROTATION_DEGREES,
  SPECTRAL_FINGERPRINT_TILT_DEGREES,
} from '../visualizations/spectralFingerprint'
import { VitalTransferControls } from './VitalTransferControls'

interface VariantComparisonSidebarProps {
  patches: { A: PatchState; B: PatchState | null }
  transfer: ComponentProps<typeof VitalTransferControls>
  variant: VariantSwitcherProps
}

const ATTRIBUTES = ['Brightness', 'Warmth', 'Movement', 'Complexity'] as const

function seedFor(text: string): number {
  let seed = 2166136261
  for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  return seed >>> 0
}

function attributeValues(patch: PatchState | null, variant: 'A' | 'B'): number[] {
  let seed = seedFor(`${variant}:${patch?.metadata.name ?? 'empty'}`)
  return ATTRIBUTES.map(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return 24 + (seed % 70)
  })
}

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
    aria-label={`Variant ${variant} 3D time-frequency spectrogram at ${Math.round(view.rotation)} degrees rotation and ${Math.round(view.tilt)} degrees tilt with ${SPECTRAL_FINGERPRINT_FRAMES} time frames. Drag to rotate and tilt; double-click to reset.${patch ? '' : ' Unavailable.'}`}
    data-bins={SPECTRAL_FINGERPRINT_BANDS}
    data-color={color.hex}
    data-depth-lines={SPECTRAL_FINGERPRINT_FRAMES}
    data-frequency-direction="left-to-right"
    data-line-style="solid ridgeline"
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

function AttributeBars({ patch, variant }: { patch: PatchState | null; variant: 'A' | 'B' }) {
  const values = useMemo(() => attributeValues(patch, variant), [patch, variant])
  return <div className="attribute-bars" data-available={Boolean(patch)}>
    {ATTRIBUTES.map((attribute, index) => <div className="attribute-row" key={attribute}>
      <span>{attribute}</span>
      <i><b style={{ width: `${values[index]}%` }} /></i>
    </div>)}
  </div>
}

export function VariantComparisonSidebar({ patches, transfer, variant }: VariantComparisonSidebarProps) {
  const [spectrogramView, setSpectrogramView] = useState<SpectrogramView>({ rotation: SPECTRAL_FINGERPRINT_ROTATION_DEGREES, tilt: SPECTRAL_FINGERPRINT_TILT_DEGREES })
  const activateVariant = (variantId: 'A' | 'B') => {
    if (variantId === 'B' && !variant.hasVariantB) variant.onCreateVariant()
    else variant.onSelectVariant(variantId)
  }

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
          <AttributeBars patch={patches[variantId]} variant={variantId} />
          </article>
        </div>)}
      </div>
    </section>
  </aside>
}
