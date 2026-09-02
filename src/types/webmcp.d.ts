interface ModelContextToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

interface ModelContextToolExecutionContext {
  signal?: AbortSignal
}

interface ModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: ModelContextToolAnnotations
  execute: (
    input: Record<string, unknown>,
    context?: ModelContextToolExecutionContext,
  ) => Promise<unknown>
}

interface RegisteredModelContextTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations: Required<ModelContextToolAnnotations>
}

interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void>
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredModelContextTool[]>
  executeTool(
    tool: RegisteredModelContextTool,
    input?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<string>
  ontoolchange: ((event: Event) => void) | null
}

interface Document {
  readonly modelContext?: ModelContext
}

interface Window {
  __WAVETABLE_WORKBENCH_TRACE__?: import('../dev/latencyTrace').LatencyTrace
}
