import { useEffect, useState } from 'react'

export interface NotePlayback {
  isNotePlaying: boolean
  triggerTimeMs: number
}

export function useVisualElapsedSeconds(enabled: boolean, notePlayback: NotePlayback): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    setElapsedSeconds(0)
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = requestAnimationFrame(function update(now) {
      setElapsedSeconds(Math.max(0, now - notePlayback.triggerTimeMs) / 1_000)
      frame = requestAnimationFrame(update)
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled, notePlayback.triggerTimeMs])

  return elapsedSeconds
}
