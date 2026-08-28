import { CommandService } from '../commands/CommandService'
import { SessionService } from '../session/SessionService'
import { createApplyPatchTool } from './applyPatchTool'
import { createGetPatchTool } from './getPatchTool'
import type { ModelContextGateway, WebMcpToolDefinition } from './ModelContextGateway'
import { createSetLfoShapeTool } from './setLfoShapeTool'

export interface ToolRegistration {
  status: 'available' | 'unavailable'
  reason?: string
  tools: WebMcpToolDefinition[]
  signal: AbortSignal | null
  dispose: () => void
}

export async function registerTools(
  gateway: ModelContextGateway,
  session: SessionService,
  commandService: CommandService,
): Promise<ToolRegistration> {
  if (!gateway.available) {
    return {
      status: 'unavailable',
      reason: gateway.unavailableReason,
      tools: [],
      signal: null,
      dispose: () => undefined,
    }
  }

  const registrationController = new AbortController()
  const tools = [
    createGetPatchTool(session),
    createApplyPatchTool(commandService),
    createSetLfoShapeTool(commandService),
  ]

  try {
    await Promise.all(
      tools.map((tool) =>
        gateway.registerTool(tool, { signal: registrationController.signal }),
      ),
    )
  } catch (error) {
    registrationController.abort()
    throw error
  }

  return {
    status: 'available',
    tools,
    signal: registrationController.signal,
    dispose: () => registrationController.abort(),
  }
}
