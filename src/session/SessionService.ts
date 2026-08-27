import { parsePatchState } from '../patch/schemas'
import type { PatchState } from '../patch/types'
import type { PatchDiff } from '../commands/diff'
import type { RequestSource } from '../dev/latencyTrace'

export interface SessionCommitEvent {
  patch: PatchState
  changed: PatchDiff
  correlationId: string
  reason: string
  source: RequestSource
  kind: 'command' | 'undo'
}

type SessionSubscriber = (event: SessionCommitEvent) => void

export class SessionService {
  private patch: PatchState
  private readonly subscribers = new Set<SessionSubscriber>()

  constructor(
    initialPatch: PatchState,
    private readonly onSubscriberError: (error: unknown) => void = () => undefined,
  ) {
    this.patch = structuredClone(parsePatchState(initialPatch))
  }

  getPatch(): PatchState {
    return structuredClone(this.patch)
  }

  subscribe(subscriber: SessionSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  commit(
    event: SessionCommitEvent,
    afterStateUpdate: () => void = () => undefined,
  ): void {
    this.patch = structuredClone(parsePatchState(event.patch))
    afterStateUpdate()

    for (const subscriber of this.subscribers) {
      try {
        subscriber({ ...structuredClone(event), patch: this.getPatch() })
      } catch (error) {
        this.onSubscriberError(error)
      }
    }
  }
}
