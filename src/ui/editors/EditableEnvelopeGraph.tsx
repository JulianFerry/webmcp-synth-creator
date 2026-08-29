import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { EnvelopeState } from '../../patch/types'
import { createEnvelopePlot } from '../visualizations'
import { ENVELOPE_HANDLE_FIELDS, envelopeHandlePoints, envelopeValueFromPoint, nudgeEnvelopeValue, type EnvelopeHandle } from './envelopeHandles'

interface Props {
  envelope: EnvelopeState
  previewEnvelope: EnvelopeState
  resetKey: number
  onCommit: (handle: EnvelopeHandle, value: number) => boolean
  onPreview: (handle: EnvelopeHandle, value: number) => void
  onCancel: (handle: EnvelopeHandle) => void
}

const label = (handle: EnvelopeHandle) => handle[0].toUpperCase() + handle.slice(1)
const valueText = (handle: EnvelopeHandle, value: number) => handle === 'sustain' ? `${Math.round(value * 100)} percent` : value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${value.toFixed(2)} seconds`

export function EditableEnvelopeGraph({ envelope, previewEnvelope, resetKey, onCommit, onPreview, onCancel }: Props) {
  const [draft, setDraft] = useState(previewEnvelope)
  const draftRef = useRef(draft)
  const activeRef = useRef<EnvelopeHandle | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (activeRef.current) return
    activeRef.current = null
    draftRef.current = previewEnvelope
    setDraft(previewEnvelope)
  }, [envelope, previewEnvelope, resetKey])

  useEffect(() => () => {
    if (activeRef.current) onCancelRef.current(activeRef.current)
  }, [])

  const update = (handle: EnvelopeHandle, value: number) => {
    const next = { ...draftRef.current, [ENVELOPE_HANDLE_FIELDS[handle]]: value }
    draftRef.current = next
    setDraft(next)
    onPreview(handle, value)
  }
  const finish = (handle: EnvelopeHandle) => {
    if (activeRef.current !== handle) return
    const value = draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]]
    const accepted = onCommit(handle, value)
    activeRef.current = null
    if (!accepted) {
      onCancel(handle)
      draftRef.current = envelope
      setDraft(envelope)
    }
  }
  const cancel = (handle: EnvelopeHandle) => {
    if (activeRef.current !== handle) return
    activeRef.current = null
    onCancel(handle)
    draftRef.current = envelope
    setDraft(envelope)
  }
  const fromPointer = (event: PointerEvent, handle: EnvelopeHandle) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 72
    update(handle, envelopeValueFromPoint(handle, x, y, draftRef.current))
  }
  const onKeyDown = (event: KeyboardEvent<SVGCircleElement>, handle: EnvelopeHandle) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(handle); return }
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    if (!activeRef.current) activeRef.current = handle
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1
    update(handle, nudgeEnvelopeValue(handle, draftRef.current[ENVELOPE_HANDLE_FIELDS[handle]], direction))
  }
  const plot = createEnvelopePlot(draft)
  const points = envelopeHandlePoints(draft)

  return <svg ref={svgRef} aria-label="Editable ADSR amplitude envelope" className="envelope-plot editable-graph" role="group" viewBox="0 0 100 72"
    onPointerCancel={() => { if (activeRef.current) cancel(activeRef.current) }}
    onPointerMove={(event) => { if (activeRef.current) fromPointer(event, activeRef.current) }}
    onPointerUp={(event) => { const handle = activeRef.current; if (!handle) return; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish(handle) }}>
    <path className="plot-grid" d="M0 18H100M0 36H100M0 54H100M25 0V72M50 0V72M75 0V72" />
    <path className="plot-line" d={plot.path} data-testid="amp-envelope-path" />
    {(Object.keys(points) as EnvelopeHandle[]).map((handle) => <circle
      aria-label={`${label(handle)} handle`}
      aria-valuemax={handle === 'sustain' ? 1 : handle === 'attack' ? 3 : handle === 'decay' ? 5 : 8}
      aria-valuemin={0}
      aria-valuenow={draft[ENVELOPE_HANDLE_FIELDS[handle]]}
      aria-valuetext={valueText(handle, draft[ENVELOPE_HANDLE_FIELDS[handle]])}
      className="graph-handle"
      cx={points[handle].x} cy={points[handle].y}
      data-testid={`amp-${handle}-handle`}
      key={handle}
      onKeyDown={(event) => onKeyDown(event, handle)}
      onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish(handle) }}
      onPointerDown={(event) => { activeRef.current = handle; svgRef.current?.setPointerCapture(event.pointerId) }}
      r="2.4" role="slider" tabIndex={0}
    />)}
  </svg>
}
