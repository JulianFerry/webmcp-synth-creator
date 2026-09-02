import type { ApplyPatchCommand, PatchState } from '../patch/types'
import { resolveArticulation, resolveLayer } from './articulationAndLayer'
import { resolveDrive, resolveSpace, resolveWidth } from './effects'
import { resolveBalance, resolveGate, resolveMovement, resolvePitch, resolveResponse } from './modulationAndVoice'
import { resolveTimbre, resolveTone } from './toneAndTimbre'
import type { Change, Operation, RawChange } from './types'

function resolveOperation(patch: PatchState, operation: Operation): RawChange[] {
  switch (operation.op) {
    case 'tone': return resolveTone(operation)
    case 'articulation': return resolveArticulation(patch, operation)
    case 'timbre': return resolveTimbre(patch, operation)
    case 'width': return resolveWidth(operation)
    case 'space': return resolveSpace(operation)
    case 'drive': return resolveDrive(operation)
    case 'movement': return resolveMovement(patch, operation)
    case 'gate': return resolveGate(patch, operation)
    case 'balance': return resolveBalance(operation)
    case 'layer': return resolveLayer(patch, operation)
    case 'pitch': return resolvePitch(operation)
    case 'response': return resolveResponse(patch, operation)
  }
}

export function resolveOps(patch: PatchState, changes: Change[]): ApplyPatchCommand['changes'] {
  const merged = new Map<RawChange['path'], unknown>()
  for (const change of changes) {
    const resolved = 'op' in change ? resolveOperation(patch, change) : [change]
    for (const item of resolved) {
      if (merged.has(item.path)) merged.delete(item.path)
      merged.set(item.path, item.value)
    }
  }
  return [...merged].map(([path, value]) => ({ path, value }))
}

export type { Change, Operation } from './types'
