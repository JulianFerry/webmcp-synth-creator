import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { DEFAULT_EFFECT_ORDER, type EffectId } from '../../patch/effects'

export interface EffectDefinition {
  id: EffectId
  name: string
  description: string
}

interface EffectsGridProps {
  order: EffectId[]
  onOrderChange: (order: EffectId[]) => boolean
  renderEffect: (effect: EffectDefinition) => ReactNode
}

const EFFECTS: Record<EffectId, EffectDefinition> = {
  distortion: { id: 'distortion', name: 'Distortion', description: 'Harmonic drive' },
  filter: { id: 'filter', name: 'Filter', description: 'Tone shaping' },
  compressor: { id: 'compressor', name: 'Compressor', description: 'Dynamic control' },
  chorus: { id: 'chorus', name: 'Chorus', description: 'Stereo motion' },
  delay: { id: 'delay', name: 'Delay', description: 'Echo and repeats' },
  reverb: { id: 'reverb', name: 'Reverb', description: 'Spatial tail' },
}

function moveEffect(order: EffectId[], draggedId: EffectId, targetIndex: number): EffectId[] {
  const sourceIndex = order.indexOf(draggedId)
  if (sourceIndex === targetIndex) return order
  const nextOrder = order.filter((id) => id !== draggedId)
  nextOrder.splice(Math.max(0, Math.min(targetIndex, nextOrder.length)), 0, draggedId)
  return nextOrder
}

function GridConnector({ position }: { position: number }) {
  if (position === DEFAULT_EFFECT_ORDER.length - 1) return null
  return <span className="fx-grid-connector" aria-hidden="true">
    <svg className="fx-grid-connector-short" viewBox="0 0 32 32">
      <path className="fx-connector-line" d="M3 16h21" />
      <path className="fx-connector-head" d="m29 16-6-4v8Z" />
    </svg>
    <svg className="fx-grid-connector-wrap" preserveAspectRatio="none" viewBox="0 0 1000 32">
      <path className="fx-connector-line" d="M750 1v9q0 5-5 5H255q-5 0-5 5v6" />
      <path className="fx-connector-head" d="m250 30-4-6h8Z" />
    </svg>
  </span>
}

function DragGrip({ name }: { name: string }) {
  return <><span className="fx-drag-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><span className="visually-hidden">Drag {name} to reorder</span></>
}

export function EffectsGrid({ onOrderChange, order, renderEffect }: EffectsGridProps) {
  const [effectOrder, setEffectOrder] = useState<EffectId[]>(() => [...order])
  const [draggingEffect, setDraggingEffect] = useState<EffectId | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const dragRef = useRef<EffectId | null>(null)
  const dropRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const pointerPositionRef = useRef({ x: 0, y: 0 })
  const scrollFrameRef = useRef<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => setEffectOrder([...order]), [order])

  const updateDropTarget = (target: number | null) => {
    dropRef.current = target
    setDropTarget(target)
  }

  const finishDrag = (targetIndex = dropRef.current) => {
    const draggedId = dragRef.current
    if (draggedId && targetIndex !== null) {
      const nextOrder = moveEffect(effectOrder, draggedId, targetIndex)
      if (onOrderChange(nextOrder)) {
        setEffectOrder(nextOrder)
        setAnnouncement(`${EFFECTS[draggedId].name} moved to position ${nextOrder.indexOf(draggedId) + 1}`)
      }
    }
    dragRef.current = null
    pointerIdRef.current = null
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = null
    setDraggingEffect(null)
    updateDropTarget(null)
  }

  const targetIndexAtPoint = (clientX: number, clientY: number): number | null => {
    const grid = gridRef.current
    if (!grid) return null
    const modules = [...grid.querySelectorAll<HTMLElement>('[data-flow-position]')]
    if (modules.length === 0) return null
    const gridBounds = grid.getBoundingClientRect()
    if (clientY <= gridBounds.top) return 0
    if (clientY >= gridBounds.bottom) return modules.length - 1
    const columns = gridRef.current
      ? getComputedStyle(gridRef.current).gridTemplateColumns.trim().split(/\s+/).length
      : 2
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    modules.forEach((module) => {
      const bounds = module.getBoundingClientRect()
      const xDistance = columns === 1 ? 0 : clientX - (bounds.left + bounds.width / 2)
      const yDistance = clientY - (bounds.top + bounds.height / 2)
      const distance = xDistance * xDistance + yDistance * yDistance
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = Number(module.dataset.flowPosition)
      }
    })
    return closestIndex
  }

  const updateTargetAtPoint = (clientX: number, clientY: number) => {
    const atPageTop = window.scrollY <= 1
    const atPageBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1
    if (atPageTop && clientY <= 24) {
      updateDropTarget(0)
      return
    }
    if (atPageBottom && clientY >= window.innerHeight - 24) {
      updateDropTarget(DEFAULT_EFFECT_ORDER.length - 1)
      return
    }
    updateDropTarget(targetIndexAtPoint(clientX, clientY))
  }

  const autoScroll = () => {
    if (pointerIdRef.current === null) return
    const { x, y } = pointerPositionRef.current
    const threshold = Math.min(180, window.innerHeight * 0.28)
    let delta = 0
    if (y < threshold) delta = -Math.ceil((threshold - y) / 7)
    if (y > window.innerHeight - threshold) delta = Math.ceil((y - (window.innerHeight - threshold)) / 7)
    if (delta !== 0) {
      window.scrollBy(0, Math.max(-24, Math.min(24, delta)))
      updateTargetAtPoint(x, y)
    }
    scrollFrameRef.current = requestAnimationFrame(autoScroll)
  }

  const handlePointerDown = (effectId: EffectId, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerIdRef.current = event.pointerId
    pointerPositionRef.current = { x: event.clientX, y: event.clientY }
    dragRef.current = effectId
    setDraggingEffect(effectId)
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(autoScroll)
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || !dragRef.current) return
    event.preventDefault()
    pointerPositionRef.current = { x: event.clientX, y: event.clientY }
    updateTargetAtPoint(event.clientX, event.clientY)
  }

  const moveWithKeyboard = (effectId: EffectId, direction: -1 | 1) => {
    const currentIndex = effectOrder.indexOf(effectId)
    const nextIndex = Math.min(effectOrder.length - 1, Math.max(0, currentIndex + direction))
    if (nextIndex === currentIndex) return
    const nextOrder = [...effectOrder]
    nextOrder.splice(currentIndex, 1)
    nextOrder.splice(nextIndex, 0, effectId)
    if (onOrderChange(nextOrder)) {
      setEffectOrder(nextOrder)
      setAnnouncement(`${EFFECTS[effectId].name} moved to position ${nextIndex + 1}`)
    }
  }

  return <div className="fx-grid" data-testid="effects-grid" ref={gridRef} role="list">
    {effectOrder.map((effectId, position) => {
      const effect = EFFECTS[effectId]
      const isDropTarget = dropTarget === position
      return <div
        className="fx-grid-module"
        data-dragging={draggingEffect === effectId || undefined}
        data-drop-placement={isDropTarget ? 'target' : undefined}
        data-effect-id={effectId}
        data-flow-position={position}
        data-testid={`effect-card-${effectId}`}
        key={effectId}
        role="listitem"
      >
        <button
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          className="fx-module-drag-handle"
          onKeyDown={(event) => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault()
            moveWithKeyboard(effectId, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)
          }}
          onPointerCancel={() => finishDrag(null)}
          onPointerDown={(event) => handlePointerDown(effectId, event)}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            if (pointerIdRef.current !== event.pointerId) return
            updateTargetAtPoint(event.clientX, event.clientY)
            finishDrag(dropRef.current)
          }}
          type="button"
        >
          <DragGrip name={effect.name} />
        </button>
        {renderEffect(effect)}
        <GridConnector position={position} />
      </div>
    })}
    <p className="visually-hidden" aria-live="polite">{announcement}</p>
  </div>
}
