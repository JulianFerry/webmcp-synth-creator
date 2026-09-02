import { FLAT_GATE_PATTERN, GATE_PATTERNS } from './patterns'
import { MOVEMENT_SHAPES } from './shapes'
import { normalizedToGlideSeconds, normalizedToLfoDivision, normalizedToLfoHz } from './normalization'
import type { Operation, RawChange } from './types'

export function resolveMovement(op: Extract<Operation, { op: 'movement' }>): RawChange[] {
  const rate = op.rate ?? 0.25
  const target = op.target ?? 'position'
  return [
    { path: 'lfo2.enabled', value: true },
    { path: 'lfo2.points', value: structuredClone(MOVEMENT_SHAPES[op.shape ?? 'sine']) },
    { path: 'lfo2.rate', value: op.sync ?? true ? { mode: 'sync', division: normalizedToLfoDivision(rate) } : { mode: 'free', hz: normalizedToLfoHz(rate) } },
    { path: 'lfo2.smoothing', value: 0.4 },
    { path: 'lfo2.target', value: target },
    { path: 'lfo2.scope', value: target === 'cutoff' ? 'all' : (op.scope ?? 'all') },
    { path: 'lfo2.depth', value: op.amount },
  ]
}

export function resolveGate(op: Extract<Operation, { op: 'gate' }>): RawChange[] {
  const target = op.target ?? 'level'
  return [
    { path: 'lfo1.enabled', value: true },
    { path: 'lfo1.points', value: structuredClone(op.pattern === 'none' ? FLAT_GATE_PATTERN : GATE_PATTERNS[op.pattern]) },
    { path: 'lfo1.rate', value: { mode: 'sync', division: op.division ?? '1/1' } },
    { path: 'lfo1.smoothing', value: op.smoothing ?? 0.08 },
    { path: 'lfo1.target', value: target },
    { path: 'lfo1.scope', value: target === 'cutoff' ? 'all' : (op.scope ?? 'all') },
    { path: 'lfo1.depth', value: op.depth ?? 0.85 },
  ]
}

export function resolveBalance(op: Extract<Operation, { op: 'balance' }>): RawChange[] {
  const changes: RawChange[] = []
  if (op.osc1 !== undefined) changes.push({ path: 'oscillators.0.level', value: op.osc1 })
  if (op.osc2 !== undefined) changes.push({ path: 'oscillators.1.level', value: op.osc2 }, { path: 'oscillators.1.enabled', value: op.osc2 > 0 })
  if (op.osc3 !== undefined) changes.push({ path: 'oscillators.2.level', value: op.osc3 }, { path: 'oscillators.2.enabled', value: op.osc3 > 0 })
  return changes
}

export function resolvePitch(op: Extract<Operation, { op: 'pitch' }>): RawChange[] {
  const mono = op.mono ?? false
  return [
    { path: 'voice.transposeSemitones', value: Math.min(36, Math.max(-36, (op.octave ?? 0) * 12 + (op.semitones ?? 0))) },
    { path: 'voice.glideSeconds', value: normalizedToGlideSeconds(op.glide ?? 0) },
    { path: 'voice.polyphony', value: mono ? 1 : 8 },
    { path: 'voice.legato', value: op.legato ?? mono },
  ]
}

export function resolveResponse(op: Extract<Operation, { op: 'response' }>): RawChange[] {
  const changes: RawChange[] = []
  if (op.velocity_to_level !== undefined) changes.push({ path: 'voice.velocitySensitivity', value: op.velocity_to_level })
  if (op.velocity_to_cutoff !== undefined) changes.push({ path: 'filter.velocityToCutoff', value: op.velocity_to_cutoff })
  if (op.keytrack !== undefined) changes.push({ path: 'filter.keytrack', value: op.keytrack })
  return changes
}
