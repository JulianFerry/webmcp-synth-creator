import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { evaluateLfoPoints } from '../../audio/lfo'
import type { LfoPoint } from '../../patch/types'
import { deleteLfoPoint, insertLfoPoint, moveLfoPoint } from './lfoPoints'

interface Props { points: LfoPoint[]; smooth: boolean; resetKey: number; onCommit: (points: LfoPoint[]) => boolean }
const shapePath = (points: LfoPoint[], smooth: boolean) => Array.from({ length: 129 }, (_, index) => {
  const phase = index / 128
  const value = evaluateLfoPoints(points, phase === 1 ? .999999 : phase, smooth)
  return `${index ? 'L' : 'M'}${(phase * 100).toFixed(3)} ${(66 - value * 60).toFixed(3)}`
}).join(' ')

export function EditableLfoGraph({ points, smooth, resetKey, onCommit }: Props) {
  const [draft, setDraft] = useState(points)
  const draftRef = useRef(points)
  const activeRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => { activeRef.current = null; draftRef.current = points; setDraft(points) }, [points, resetKey])
  const coordinates = (event: PointerEvent) => { const rect = svgRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (66 - ((event.clientY - rect.top) / rect.height) * 72) / 60)) } }
  const finish = () => { if (activeRef.current === null) return; const accepted = onCommit(draftRef.current); activeRef.current = null; if (!accepted) { draftRef.current = points; setDraft(points) } }
  const cancel = () => { activeRef.current = null; draftRef.current = points; setDraft(points) }
  const move = (index: number, point: LfoPoint) => { const next = moveLfoPoint(draftRef.current, index, point); draftRef.current = next; setDraft(next) }
  const keyDown = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); const next = deleteLfoPoint(draftRef.current, index); if (next !== draftRef.current && onCommit(next)) { draftRef.current = next; setDraft(next) }; return }
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault(); activeRef.current = index
    const point = draftRef.current[index]; move(index, { ...point, x: point.x + (event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0), y: point.y + (event.key === 'ArrowUp' ? .01 : event.key === 'ArrowDown' ? -.01 : 0) })
  }
  return <svg ref={svgRef} aria-label={`Editable LFO shape with ${draft.length} points`} className="editable-graph" role="group" viewBox="0 0 100 72" onDoubleClick={(event) => { const next = insertLfoPoint(draftRef.current, coordinates(event as unknown as PointerEvent)); if (next !== draftRef.current && onCommit(next)) { draftRef.current = next; setDraft(next) } }}>
    <path className="plot-grid" d="M0 18H100M0 36H100M0 54H100M25 0V72M50 0V72M75 0V72" />
    <path className="plot-line lfo-shape-line" d={shapePath(draft, smooth)} data-testid="lfo-shape-path" />
    {draft.map((point, index) => <circle aria-label={`LFO point ${index + 1}`} aria-valuetext={`${Math.round(point.x * 100)} percent phase, ${Math.round(point.y * 100)} percent level`} className="lfo-point graph-handle" cx={point.x * 100} cy={66 - point.y * 60} data-testid={`lfo-point-${index}`} key={index} onKeyDown={(event) => keyDown(event, index)} onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish() }} onPointerCancel={cancel} onPointerDown={(event) => { activeRef.current = index; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (activeRef.current === index) move(index, coordinates(event)) }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finish() }} r="2.2" role="slider" tabIndex={0} />)}
  </svg>
}
