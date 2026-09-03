import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react'
import type { EnvelopeState } from '../../patch/types'
import { createEnvelopePlot } from '../visualizations'
import { ENVELOPE_HANDLE_FIELDS, envelopeHandlePoints, envelopeValueFromPoint, nudgeEnvelopeValue, type EnvelopeHandle } from './envelopeHandles'
import { clientPointToSvg } from './svgCoordinates'

interface Props {
  envelope: EnvelopeState
  previewEnvelope: EnvelopeState
  resetKey: number
  onCommit: (handle: EnvelopeHandle, value: number) => boolean
  onPreview: (handle: EnvelopeHandle, value: number) => void
  onCancel: (handle: EnvelopeHandle) => void
  testIdPrefix?: string
  showDelayControl?: boolean
  showHoldControl?: boolean
}

const label = (handle: EnvelopeHandle) => `${handle[0].toUpperCase()}${handle.slice(1).replace('Curve', ' curve')}`
const valueText = (handle: EnvelopeHandle, value: number) => handle.endsWith('Curve') ? `${value.toFixed(2)} curve` : handle === 'sustain' ? `${Math.round(value * 100)} percent` : value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${value.toFixed(2)} seconds`

export function EditableEnvelopeGraph({ envelope, previewEnvelope, resetKey, onCommit, onPreview, onCancel, testIdPrefix = 'amp', showDelayControl = true, showHoldControl = true }: Props) {
  const fillGradientId = `envelope-fill-${useId().replaceAll(':', '')}`
  const [draft, setDraft] = useState(previewEnvelope)
  const draftRef = useRef(draft)
  const activeRef = useRef<EnvelopeHandle | null>(null)
  const activeFieldRef = useRef<EnvelopeHandle | null>(null)
  const changedRef = useRef(false)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (activeRef.current) return
    activeFieldRef.current = null
    draftRef.current = previewEnvelope
    setDraft(previewEnvelope)
  }, [envelope, previewEnvelope, resetKey])

  useEffect(() => () => {
    if (activeFieldRef.current) onCancelRef.current(activeFieldRef.current)
  }, [])

  const update = (handle: EnvelopeHandle, value: number) => {
    if (Object.is(draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]], value)) return
    const next = { ...draftRef.current, [ENVELOPE_HANDLE_FIELDS[handle]]: value }
    changedRef.current = true
    draftRef.current = next
    setDraft(next)
    onPreview(handle, value)
  }
  const finish = () => {
    const handle = activeFieldRef.current
    if (!activeRef.current || !handle) {
      activeRef.current = null
      return
    }
    if (!changedRef.current) {
      activeRef.current = null
      activeFieldRef.current = null
      return
    }
    const value = draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]]
    const accepted = onCommit(handle, value)
    activeRef.current = null
    activeFieldRef.current = null
    changedRef.current = false
    if (!accepted) {
      onCancel(handle)
      draftRef.current = envelope
      setDraft(envelope)
    }
  }
  const cancel = () => {
    if (!activeRef.current) return
    const handle = activeFieldRef.current
    activeRef.current = null
    activeFieldRef.current = null
    changedRef.current = false
    if (handle) onCancel(handle)
    draftRef.current = envelope
    setDraft(envelope)
  }
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !activeRef.current) return
      event.preventDefault()
      cancel()
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [envelope, onCancel])

  const fromPointer = (event: PointerEvent) => {
    const active = activeRef.current
    if (!active) return
    if (!changedRef.current) {
      const dx = event.clientX - pointerStartRef.current.x
      const dy = event.clientY - pointerStartRef.current.y
      if (Math.hypot(dx, dy) < 2) return
    }
    const point = clientPointToSvg(svgRef.current!, event.clientX, event.clientY)
    const field = activeFieldRef.current
    if (field) update(field, envelopeValueFromPoint(field, point.x, point.y, draftRef.current, { includeDelayPhase: showDelayControl }))
  }
  const onKeyDown = (event: ReactKeyboardEvent<SVGCircleElement>, handle: EnvelopeHandle) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    activeRef.current = handle
    activeFieldRef.current = handle
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1
    update(handle, nudgeEnvelopeValue(handle, draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]], direction))
  }
  const points = envelopeHandlePoints(draft, { includeDelayPhase: showDelayControl })
  const plot = createEnvelopePlot(draft, { includeDelayPhase: showDelayControl })
  const handles: Array<{ handle: EnvelopeHandle; x: number; y: number }> = [
    ...(showDelayControl ? [{ handle: 'delay' as const, ...points.delay }] : []),
    { handle: 'attack', ...points.attack },
    ...(showHoldControl ? [{ handle: 'hold' as const, ...points.hold }] : []),
    { handle: 'decay', ...points.decay },
    { handle: 'sustain', ...points.sustain },
    { handle: 'release', ...points.release },
    { handle: 'attackCurve', ...points.attackCurve },
    { handle: 'decayCurve', ...points.decayCurve },
    { handle: 'releaseCurve', ...points.releaseCurve },
  ]

  return <svg ref={svgRef} aria-label={`Editable ${showDelayControl ? 'D' : ''}A${showHoldControl ? 'H' : ''}DSR amplitude envelope`} className="envelope-plot editable-graph" data-plot-inset="4" role="group" viewBox="0 0 100 32"
    onPointerCancel={cancel}
    onPointerMove={fromPointer}
    onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish() }}>
    <defs><linearGradient id={fillGradientId} x1="0" x2="0" y1="0" y2="1"><stop className="plot-area-stop-top" offset="0" /><stop className="plot-area-stop-bottom" offset="1" /></linearGradient></defs>
    <path className="plot-grid" d="M2 8H98M2 16H98M2 24H98M25 2V30M50 2V30M75 2V30" />
    <path aria-hidden="true" className="plot-area" d={`${plot.path} L4 29 Z`} fill={`url(#${fillGradientId})`} />
    <path className="plot-line" d={plot.linePath} data-testid={`${testIdPrefix}-envelope-path`} />
    {handles.map(({ handle, x, y }) => {
      const testId = `${testIdPrefix}-${handle.replace('Curve', '-curve')}-handle`
      const ariaLabel = `${label(handle)} handle`
      const ariaValueText = valueText(handle, draft[ENVELOPE_HANDLE_FIELDS[handle]])
      return <g key={handle}>
        <circle aria-hidden="true" className="graph-handle-ring" cx={x} cy={y} r="1.4" />
        <circle
        aria-label={ariaLabel}
        aria-valuemax={handle.endsWith('Curve') ? 1 : handle === 'sustain' ? 1 : handle === 'delay' || handle === 'hold' ? 4 : handle === 'attack' ? 3 : handle === 'decay' ? 5 : 8}
        aria-valuemin={handle.endsWith('Curve') ? -1 : 0}
        aria-valuenow={draft[ENVELOPE_HANDLE_FIELDS[handle]]}
        aria-valuetext={ariaValueText}
        className={`graph-handle envelope-${handle}-handle${handle.endsWith('Curve') ? ' graph-curve-handle' : ''}`}
        cx={x}
        cy={y}
        data-testid={testId}
        onKeyDown={(event) => onKeyDown(event, handle)}
        onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish() }}
        onPointerDown={(event) => {
          event.preventDefault()
          pointerStartRef.current = { x: event.clientX, y: event.clientY }
          changedRef.current = false
          activeRef.current = handle
          activeFieldRef.current = handle
          svgRef.current?.setPointerCapture(event.pointerId)
        }}
        data-handle-diameter="12"
        r="1.4"
        role="slider"
        tabIndex={0}
        />
      </g>
    })}
  </svg>
}
