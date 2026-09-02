import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { evaluateLfoPoints } from '../../audio/lfo'
import { deleteLfoPoint, insertLfoPoint, moveLfoCurvePoint, moveLfoPoint, setLfoCurvePower } from '../../patch/lfoPoints'
import type { LfoPoint } from '../../patch/types'
import { clientPointToSvg } from './svgCoordinates'

interface Props { points: LfoPoint[]; smooth: boolean; resetKey: number; testIdPrefix: string; onCommit: (points: LfoPoint[]) => boolean }
type ActiveHandle = { kind: 'position' | 'curve'; index: number }

const shapePath = (points: LfoPoint[], smooth: boolean) => Array.from({ length: 129 }, (_, index) => {
  const phase = index / 128
  const value = evaluateLfoPoints(points, phase === 1 ? .999999 : phase, smooth)
  return `${index ? 'L' : 'M'}${(4 + phase * 92).toFixed(3)} ${(29 - value * 26).toFixed(3)}`
}).join(' ')

export function EditableLfoGraph({ points, smooth, resetKey, testIdPrefix, onCommit }: Props) {
  const fillGradientId = `lfo-fill-${useId().replaceAll(':', '')}`
  const [draft, setDraft] = useState(points)
  const draftRef = useRef(points)
  const activeRef = useRef<ActiveHandle | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => { activeRef.current = null; draftRef.current = points; setDraft(points) }, [points, resetKey])
  const coordinates = (event: PointerEvent) => {
    const point = clientPointToSvg(svgRef.current!, event.clientX, event.clientY)
    return {
      x: Math.max(0, Math.min(1, (point.x - 4) / 92)),
      y: Math.max(0, Math.min(1, (29 - point.y) / 26)),
    }
  }
  const finish = () => { if (!activeRef.current) return; const accepted = onCommit(draftRef.current); activeRef.current = null; if (!accepted) { draftRef.current = points; setDraft(points) } }
  const cancel = () => { activeRef.current = null; draftRef.current = points; setDraft(points) }
  const update = (next: LfoPoint[]) => { draftRef.current = next; setDraft(next) }
  const moveActive = (point: LfoPoint) => {
    const active = activeRef.current
    if (!active) return
    update(active.kind === 'position'
      ? moveLfoPoint(draftRef.current, active.index, point)
      : moveLfoCurvePoint(draftRef.current, active.index, point.y))
  }
  const keyDown = (event: KeyboardEvent<SVGCircleElement>, active: ActiveHandle) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const next = active.kind === 'position'
        ? deleteLfoPoint(draftRef.current, active.index)
        : setLfoCurvePower(draftRef.current, active.index, 0)
      if (next !== draftRef.current && onCommit(next)) update(next)
      return
    }
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    activeRef.current = active
    if (active.kind === 'curve') {
      const power = draftRef.current[active.index]?.power ?? 0
      const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1
      update(setLfoCurvePower(draftRef.current, active.index, power + direction * .05))
      return
    }
    const point = draftRef.current[active.index]
    update(moveLfoPoint(draftRef.current, active.index, { ...point, x: point.x + (event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0), y: point.y + (event.key === 'ArrowUp' ? .01 : event.key === 'ArrowDown' ? -.01 : 0) }))
  }
  const handles = draft.flatMap((point, index) => {
    const position = <g key={`position-${index}`}>
      <circle aria-hidden="true" className="graph-handle-ring" cx={4 + point.x * 92} cy={29 - point.y * 26} r="1.4" />
      <circle
      aria-label={`LFO position point ${index + 1}`}
      aria-valuemax={1}
      aria-valuemin={0}
      aria-valuenow={point.x}
      aria-valuetext={`${Math.round(point.x * 100)} percent phase, ${Math.round(point.y * 100)} percent level`}
      className="lfo-point lfo-position-point graph-handle"
      cx={4 + point.x * 92}
      cy={29 - point.y * 26}
      data-handle-kind="position"
      data-testid={`${testIdPrefix}-point-${index}`}
      onKeyDown={(event) => keyDown(event, { kind: 'position', index })}
      onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish() }}
      onPointerDown={(event) => { event.preventDefault(); activeRef.current = { kind: 'position', index }; svgRef.current?.setPointerCapture(event.pointerId) }}
      data-handle-diameter="12"
      r="1.4"
      role="slider"
      tabIndex={0}
      />
    </g>
    if (index === draft.length - 1) return [position]
    const next = draft[index + 1]
    const phase = (point.x + next.x) / 2
    const level = evaluateLfoPoints(draft, phase, smooth)
    const power = point.power ?? 0
    const curve = <g key={`curve-${index}`}>
      <circle aria-hidden="true" className="graph-handle-ring" cx={4 + phase * 92} cy={29 - level * 26} r="1.4" />
      <circle
      aria-label={`LFO curve point ${index + 1}`}
      aria-valuemax={1}
      aria-valuemin={-1}
      aria-valuenow={power}
      aria-valuetext={`${power.toFixed(2)} curve power`}
      className="lfo-point lfo-curve-point graph-handle graph-curve-handle"
      cx={4 + phase * 92}
      cy={29 - level * 26}
      data-handle-kind="curve"
      data-testid={`${testIdPrefix}-curve-${index}`}
      onKeyDown={(event) => keyDown(event, { kind: 'curve', index })}
      onKeyUp={(event) => { if (event.key.startsWith('Arrow')) finish() }}
      onPointerDown={(event) => { event.preventDefault(); activeRef.current = { kind: 'curve', index }; svgRef.current?.setPointerCapture(event.pointerId) }}
      data-handle-diameter="12"
      r="1.4"
      role="slider"
      tabIndex={0}
      />
    </g>
    return [position, curve]
  })
  const path = shapePath(draft, smooth)

  return <svg ref={svgRef} aria-label={`Editable LFO shape with ${draft.length} position points and ${Math.max(0, draft.length - 1)} curve points`} className="editable-graph" data-plot-inset="4" role="group" viewBox="0 0 100 32"
    onDoubleClick={(event) => { const next = insertLfoPoint(draftRef.current, coordinates(event as unknown as PointerEvent)); if (next !== draftRef.current && onCommit(next)) update(next) }}
    onPointerCancel={cancel}
    onPointerMove={(event) => moveActive(coordinates(event))}
    onPointerUp={(event) => { if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId); finish() }}>
    <defs><linearGradient id={fillGradientId} x1="0" x2="0" y1="0" y2="1"><stop className="plot-area-stop-top" offset="0" /><stop className="plot-area-stop-bottom" offset="1" /></linearGradient></defs>
    <path className="plot-grid" d="M2 8H98M2 16H98M2 24H98M25 2V30M50 2V30M75 2V30" />
    <path aria-hidden="true" className="plot-area" d={`${path} L96 29 L4 29 Z`} fill={`url(#${fillGradientId})`} />
    <path className="plot-line lfo-shape-line" d={path} data-testid={`${testIdPrefix}-shape-path`} />
    {handles}
  </svg>
}
