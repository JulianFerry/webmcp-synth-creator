export interface ToolAnnotations {
  readOnlyHint: boolean
  untrustedContentHint: boolean
}

export interface ToolExecutionContext {
  signal: AbortSignal
}

export interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotations
  execute: (input: Record<string, unknown>, context?: ToolExecutionContext) => Promise<unknown>
}

export interface ModelContextGateway {
  readonly available: boolean
  readonly unavailableReason?: string
  registerTool(tool: WebMcpToolDefinition, options: { signal: AbortSignal }): Promise<void>
}

export class NativeModelContextGateway implements ModelContextGateway {
  readonly available = true

  constructor(private readonly context: ModelContext) {}

  async registerTool(
    tool: WebMcpToolDefinition,
    options: { signal: AbortSignal },
  ): Promise<void> {
    await this.context.registerTool(tool, options)
  }
}

export class UnavailableModelContextGateway implements ModelContextGateway {
  readonly available = false

  constructor(
    readonly unavailableReason =
      'WebMCP is unavailable. Use current Chrome with the WebMCP testing flag on a secure origin.',
  ) {}

  async registerTool(): Promise<void> {
    throw new Error(this.unavailableReason)
  }
}

export function createModelContextGateway(
  currentDocument: Document = document,
): ModelContextGateway {
  return currentDocument.modelContext
    ? new NativeModelContextGateway(currentDocument.modelContext)
    : new UnavailableModelContextGateway()
}
