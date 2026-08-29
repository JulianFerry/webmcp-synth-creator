export interface PointGesture<T> {
  committed: T
  draft: T
  active: boolean
}

export function beginPointGesture<T>(committed: T): PointGesture<T> {
  return { committed, draft: committed, active: true }
}

export function updatePointGesture<T>(gesture: PointGesture<T>, draft: T): PointGesture<T> {
  return gesture.active ? { ...gesture, draft } : gesture
}

export function commitPointGesture<T>(gesture: PointGesture<T>, accepted = true): PointGesture<T> {
  if (!gesture.active) return gesture
  return accepted
    ? { committed: gesture.draft, draft: gesture.draft, active: false }
    : { committed: gesture.committed, draft: gesture.committed, active: false }
}

export function cancelPointGesture<T>(gesture: PointGesture<T>): PointGesture<T> {
  return { committed: gesture.committed, draft: gesture.committed, active: false }
}
