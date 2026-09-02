import { z } from 'zod'

import { SessionService } from '../session/SessionService'
import type { VitalPresetAdapter } from '../vital/VitalPresetAdapter'
import type { WebMcpToolDefinition } from './ModelContextGateway'

export interface ExportPatchAccess {
  snapshot: () => {
    adapter: VitalPresetAdapter | null
    status: 'loading' | 'ready' | 'missing'
    error?: string | null
  }
}

const inputSchema = z.object({ filename: z.string().trim().min(1).optional() }).strict()

export function createExportPatchTool(session: SessionService, access: ExportPatchAccess): WebMcpToolDefinition {
  return {
    name: 'export_patch', title: 'Export current patch to Vital',
    description: 'Validate, serialize, and download the current patch as a .vital preset.',
    inputSchema: { type: 'object', properties: { filename: { type: 'string', minLength: 1 } }, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input, context) {
      context?.signal.throwIfAborted()
      const snapshot = access.snapshot()
      if (snapshot.status !== 'ready' || !snapshot.adapter) {
        return { ok: false, error: { code: 'VITAL_NOT_READY', message: snapshot.error ?? 'Vital export is not ready' } }
      }
      const { filename } = inputSchema.parse(input)
      const adapter = snapshot.adapter
      const patch = session.getPatch()
      const exported = adapter.exportPatch(patch)
      const validation = adapter.importPatchStrict(exported.document)
      return {
        filename: adapter.downloadPatch(patch, filename),
        validation: { valid: true, mode: 'strict', warnings: validation.warnings },
      }
    },
  }
}
