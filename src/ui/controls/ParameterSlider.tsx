import { useEffect, useRef, useState } from 'react'

import {
  controlValueToParameterValue,
  navigateParameterScale,
  parameterValueToControlValue,
  type ParameterScale,
  type ParameterScaleNavigationKey,
} from './parameterScale'

interface ParameterSliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (value: number) => boolean | void
  onPreview?: (value: number) => void
  onCancel?: () => void
  formatValue?: (value: number) => string
  scale?: ParameterScale
  scaleStep?: number
  disabled?: boolean
  testId?: string
  resetKey?: number
  orientation?: 'horizontal' | 'vertical'
  describedBy?: string
}

const COMMIT_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
])

export function ParameterSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  onCommit,
  onPreview,
  onCancel,
  formatValue = (nextValue) => String(nextValue),
  scale,
  scaleStep = 0.01,
  disabled = false,
  testId,
  resetKey = 0,
  orientation = 'horizontal',
  describedBy,
}: ParameterSliderProps) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const committedRef = useRef(value)
  const previewingRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    draftRef.current = value
    committedRef.current = value
    previewingRef.current = false
    setDraft(value)
  }, [resetKey, value])

  useEffect(() => {
    return () => {
      if (!previewingRef.current) return
      previewingRef.current = false
      onCancelRef.current?.()
    }
  }, [])

  const updateDraft = (nextValue: number) => {
    draftRef.current = nextValue
    setDraft(nextValue)
    previewingRef.current = true
    onPreview?.(nextValue)
  }

  const clearPreview = () => {
    if (!previewingRef.current) return
    previewingRef.current = false
    onCancel?.()
  }

  const cancelDraft = () => {
    draftRef.current = committedRef.current
    setDraft(committedRef.current)
    clearPreview()
  }

  const commitDraft = () => {
    const nextValue = draftRef.current
    if (Object.is(nextValue, committedRef.current)) {
      clearPreview()
      return
    }
    let committed: boolean | void
    try {
      committed = onCommit(nextValue)
    } catch (error) {
      cancelDraft()
      throw error
    }
    if (committed === false) {
      cancelDraft()
      return
    }
    committedRef.current = nextValue
    clearPreview()
  }

  const controlValue = scale
    ? parameterValueToControlValue(draft, min, max, scale)
    : draft
  const controlStep = scale ? 'any' : step
  const scalePosition = scale
    ? scale.toPosition(draft, min, max)
    : (controlValue - min) / (max - min)
  const formattedDraft = formatValue(draft)

  return (
    <label className={`parameter-control parameter-control-${orientation}`} htmlFor={id}>
      <span>{label}</span>
      <output htmlFor={id}>{formattedDraft}</output>
      <input
        aria-describedby={describedBy}
        aria-orientation={orientation}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={draft}
        aria-valuetext={formattedDraft}
        data-parameter-value={draft}
        data-scale-position={scalePosition}
        data-testid={testId}
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onBlur={commitDraft}
        onInput={(event) => {
          const nextControlValue = Number(event.currentTarget.value)
          const nextValue = scale
            ? controlValueToParameterValue(nextControlValue, min, max, scale)
            : nextControlValue
          updateDraft(nextValue)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelDraft()
            return
          }
          if (scale && COMMIT_KEYS.has(event.key)) {
            event.preventDefault()
            const nextValue = navigateParameterScale(
              draftRef.current,
              min,
              max,
              scale,
              event.key as ParameterScaleNavigationKey,
              scaleStep,
            )
            if (!Object.is(nextValue, draftRef.current)) updateDraft(nextValue)
          }
        }}
        onKeyUp={(event) => {
          if (COMMIT_KEYS.has(event.key)) commitDraft()
        }}
        onPointerCancel={cancelDraft}
        onPointerUp={commitDraft}
        step={controlStep}
        type="range"
        value={controlValue}
      />
    </label>
  )
}
