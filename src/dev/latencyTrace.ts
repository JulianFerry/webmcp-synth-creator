export type LatencyTraceStage =
  | 'request_received'
  | 'patch_committed'
  | 'audio_diff_applied'

export type RequestSource = 'ui' | 'webmcp' | 'history'

export interface LatencyTraceEvent {
  correlationId: string
  stage: LatencyTraceStage
  source: RequestSource
  timestampMs: number
}

type TraceListener = (event: LatencyTraceEvent) => void

export class LatencyTrace {
  private readonly events: LatencyTraceEvent[] = []
  private readonly listeners = new Set<TraceListener>()

  constructor(
    private readonly enabled: boolean,
    private readonly now: () => number = () => performance.now(),
  ) {}

  createCorrelationId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `ww-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  record(correlationId: string, stage: LatencyTraceStage, source: RequestSource): void {
    if (!this.enabled) return

    const event = {
      correlationId,
      stage,
      source,
      timestampMs: this.now(),
    }
    this.events.push(event)
    this.listeners.forEach((listener) => listener(event))
    console.debug('[wavetable-workbench:latency]', event)
  }

  getEvents(): LatencyTraceEvent[] {
    return structuredClone(this.events)
  }

  subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.events.length = 0
  }
}

export const latencyTrace = new LatencyTrace(import.meta.env.DEV)

if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.defineProperty(window, '__WAVETABLE_WORKBENCH_TRACE__', {
    configurable: true,
    value: latencyTrace,
  })
}
