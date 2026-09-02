import type { ModulationDestination, PatchState } from '../patch/types'
import { FLAT_GATE_PATTERN, GATE_PATTERNS } from './patterns'
import { MOVEMENT_SHAPES } from './shapes'
import { normalizedToGlideSeconds, normalizedToLfoDivision, normalizedToLfoHz } from './normalization'
import { removeRoute, upsertRoute } from './modulationRoutes'
import type { Operation, RawChange } from './types'

const MOVEMENT_DESTINATIONS = {
  position: 'oscillator1.wavetablePosition', cutoff: 'filter.cutoff', pitch: 'oscillator1.pitch',
  pan: 'oscillator1.pan', level: 'oscillator1.level',
} as const satisfies Record<string, ModulationDestination>

export function resolveMovement(patch: PatchState, op: Extract<Operation, { op: 'movement' }>): RawChange[] {
  const rate = op.rate ?? 0.25
  const modulations = upsertRoute(patch.modulations, {
    source: 'lfo1', destination: MOVEMENT_DESTINATIONS[op.target ?? 'position'], amount: op.amount * 0.6, bipolar: true,
  })
  return [
    { path: 'lfo1.enabled', value: true },
    { path: 'lfo1.points', value: structuredClone(MOVEMENT_SHAPES[op.shape ?? 'sine']) },
    { path: 'lfo1.rate', value: op.sync ?? true ? { mode: 'sync', division: normalizedToLfoDivision(rate) } : { mode: 'free', hz: normalizedToLfoHz(rate) } },
    { path: 'lfo1.smoothing', value: 0.4 },
    { path: 'modulations', value: modulations },
  ]
}

export function resolveGate(patch: PatchState, op: Extract<Operation, { op: 'gate' }>): RawChange[] {
  let modulations = patch.modulations
  if (op.pattern === 'none') {
    modulations = removeRoute(modulations, 'lfo1', 'volume')
    modulations = removeRoute(modulations, 'lfo1', 'filter.cutoff')
  } else {
    const target = op.target ?? 'level'
    const amount = -(op.depth ?? 0.85)
    if (target === 'level' || target === 'both') modulations = upsertRoute(modulations, { source: 'lfo1', destination: 'volume', amount, bipolar: false })
    if (target === 'cutoff' || target === 'both') modulations = upsertRoute(modulations, { source: 'lfo1', destination: 'filter.cutoff', amount, bipolar: false })
  }
  return [
    { path: 'lfo1.enabled', value: true },
    { path: 'lfo1.points', value: structuredClone(op.pattern === 'none' ? FLAT_GATE_PATTERN : GATE_PATTERNS[op.pattern]) },
    { path: 'lfo1.rate', value: { mode: 'sync', division: op.division ?? '1/1' } },
    { path: 'lfo1.smoothing', value: op.smoothing ?? 0.08 },
    { path: 'modulations', value: modulations },
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

export function resolveResponse(patch: PatchState, op: Extract<Operation, { op: 'response' }>): RawChange[] {
  const changes: RawChange[] = []
  if (op.velocity_to_level !== undefined) changes.push({ path: 'voice.velocitySensitivity', value: op.velocity_to_level })
  if (op.velocity_to_cutoff !== undefined) {
    const routes = op.velocity_to_cutoff === 0
      ? removeRoute(patch.modulations, 'velocity', 'filter.cutoff')
      : upsertRoute(patch.modulations, { source: 'velocity', destination: 'filter.cutoff', amount: op.velocity_to_cutoff, bipolar: false })
    changes.push({ path: 'modulations', value: routes })
  }
  if (op.keytrack !== undefined) changes.push({ path: 'filter.keytrack', value: op.keytrack })
  return changes
}
