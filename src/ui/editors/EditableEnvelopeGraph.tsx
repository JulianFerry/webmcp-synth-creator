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
  showHoldControl?: boolean
}

type GraphHandle = EnvelopeHandle | 'decaySustain'

const label = (handle: EnvelopeHandle) => `${handle[0].toUpperCase()}${handle.slice(1).replace('Curve', ' curve')}`
const valueText = (handle: EnvelopeHandle, value: number) => handle.endsWith('Curve') ? `${value.toFixed(2)} curve` : handle === 'sustain' ? `${Math.round(value * 100)} percent` : value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${value.toFixed(2)} seconds`

export function EditableEnvelopeGraph({ envelope, previewEnvelope, resetKey, onCommit, onPreview, onCancel, testIdPrefix = 'amp', showHoldControl = true }: Props) {
  const fillGradientId = `envelope-fill-${useId().replaceAll(':', '')}`
  const [draft, setDraft] = useState(previewEnvelope)
  const draftRef = useRef(draft)
  const activeRef = useRef<GraphHandle | null>(null)
  const activeFieldRef = useRef<EnvelopeHandle | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
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
    const next = { ...draftRef.current, [ENVELOPE_HANDLE_FIELDS[handle]]: value }
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
    const value = draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]]
    const accepted = onCommit(handle, value)
    activeRef.current = null
    activeFieldRef.current = null
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

  const fieldForGraphHandle = (handle: GraphHandle): EnvelopeHandle | null => handle === 'decaySustain' ? null : handle
  const fromPointer = (event: PointerEvent) => {
    const active = activeRef.current
    if (!active) return
    const point = clientPointToSvg(svgRef.current!, event.clientX, event.clientY)
    if (active === 'decaySustain' && !activeFieldRef.current) {
      const dx = Math.abs(point.x - startRef.current.x)
      const dy = Math.abs(point.y - startRef.current.y)
      activeFieldRef.current = dx >= dy ? 'decay' : 'sustain'
    }
    const field = activeFieldRef.current
    if (field) update(field, envelopeValueFromPoint(field, point.x, point.y, draftRef.current))
  }
  const onKeyDown = (event: ReactKeyboardEvent<SVGCircleElement>, handle: GraphHandle) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    activeRef.current = handle
    const field: EnvelopeHandle = handle === 'decaySustain'
      ? event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'decay' : 'sustain'
      : handle
    activeFieldRef.current = field
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1
    update(field, nudgeEnvelopeValue(field, draftRef.current[ENVELOPE_HANDLE_FIELDS[field]], direction))
  }
  const points = envelopeHandlePoints(draft)
  const plot = createEnvelopePlot(draft)
  const handles: Array<{ handle: GraphHandle; x: number; y: number }> = [
    { handle: 'delay', ...points.delay },
    { handle: 'attack', ...points.attack },
    ...(showHoldControl ? [{ handle: 'hold' as const, ...points.hold }] : []),
    { handle: 'decaySustain', ...points.decay },
    { handle: 'release', ...points.release },
    { handle: 'attackCurve', ...points.attackCurve },
    { handle: 'decayCurve', ...points.decayCurve },
    { handle: 'releaseCurve', ...points.releaseCurve },
  ]

  return <svg ref={svgRef} aria-label={`Editable ${showHoldControl ? 'AHDSR' : 'ADSR'} amplitude envelope`} className="envelope-plot editable-graph" data-plot-inset="4" role="group" viewBox="0 0 100 32"
    onPointerCancel={cancel}
    onPointerMove={fromPointer}
    onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish() }}>
    <defs><linearGradient id={fillGradientId} x1="0" x2="0" y1="0" y2="1"><stop className="plot-area-stop-top" offset="0" /><stop className="plot-area-stop-bottom" offset="1" /></linearGradient></defs>
    <path className="plot-grid" d="M2 8H98M2 16H98M2 24H98M25 2V30M50 2V30M75 2V30" />
    <path aria-hidden="true" className="plot-area" d={`${plot.path} L4 29 Z`} fill={`url(#${fillGradientId})`} />
    <path className="plot-line" d={plot.path} data-testid={`${testIdPrefix}-envelope-path`} />
    {handles.map(({ handle, x, y }) => {
      const field = fieldForGraphHandle(handle)
      const combined = handle === 'decaySustain'
      const testId = combined ? `${testIdPrefix}-decay-sustain-handle` : `${testIdPrefix}-${handle.replace('Curve', '-curve')}-handle`
      const ariaLabel = combined ? 'Decay and sustain handle' : `${label(field!)} handle`
      const ariaValueText = combined
        ? `${valueText('decay', draft.decaySeconds)} decay, ${valueText('sustain', draft.sustainLevel)} sustain`
        : valueText(field!, draft[ENVELOPE_HANDLE_FIELDS[field!]])
      return <g key={handle}>
        <circle aria-hidden="true" className="graph-handle-ring" cx={x} cy={y} r="1.4" />
        <circle
        aria-label={ariaLabel}
        aria-valuemax={combined ? 5 : field?.endsWith('Curve') ? 1 : field === 'sustain' ? 1 : field === 'delay' || field === 'hold' ? 4 : field === 'attack' ? 3 : 8}
        aria-valuemin={field?.endsWith('Curve') ? -1 : 0}
        aria-valuenow={combined ? draft.decaySeconds : draft[ENVELOPE_HANDLE_FIELDS[field!]]}
        aria-valuetext={ariaValueText}
        className={`graph-handle envelope-${handle}-handle${handle.endsWith('Curve') ? ' graph-curve-handle' : ''}`}
        cx={x}
        cy={y}
        data-testid={testId}
        onKeyDown={(event) => onKeyDown(event, handle)}
        onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish() }}
        onPointerDown={(event) => {
          event.preventDefault()
          const point = clientPointToSvg(svgRef.current!, event.clientX, event.clientY)
          startRef.current = point
          activeRef.current = handle
          activeFieldRef.current = fieldForGraphHandle(handle)
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
