import type { PatchState } from '../patch/types'
import { normalizedToCutoffHz } from './normalization'
import type { Operation, RawChange, TimbreCharacter } from './types'

export function resolveTone(op: Extract<Operation, { op: 'tone' }>): RawChange[] {
  const changes: RawChange[] = [
    { path: 'filter.enabled', value: true },
    { path: 'filter.type', value: 'lowpass' },
    { path: 'filter.slope', value: op.keep_air ? 12 : 24 },
    { path: 'filter.cutoffHz', value: normalizedToCutoffHz(0.12 + op.brightness * 0.8 + (op.keep_air ? 0.06 : 0)) },
  ]
  if (op.resonance !== undefined) changes.push({ path: 'filter.resonance', value: op.resonance })
  return changes
}

const TIMBRES: Record<TimbreCharacter, { wavetableId: string; position: number }> = {
  pure: { wavetableId: 'sine', position: 0 }, warm: { wavetableId: 'warm-saw', position: 0.35 },
  bright: { wavetableId: 'airy', position: 0.7 }, hollow: { wavetableId: 'soft-square', position: 0.3 },
  vocal: { wavetableId: 'vocal', position: 0.45 }, metallic: { wavetableId: 'metallic', position: 0.55 },
  glassy: { wavetableId: 'glass', position: 0.4 }, harsh: { wavetableId: 'harsh', position: 0.75 },
  digital: { wavetableId: 'digital', position: 0.5 },
}

export function resolveTimbre(_patch: PatchState, op: Extract<Operation, { op: 'timbre' }>): RawChange[] {
  const target = op.target ?? 1
  const indices = target === 'all' ? [0, 1, 2] : target === 'both' ? [0, 1] : [target - 1]
  const timbre = TIMBRES[op.character]
  return indices.flatMap((index) => [
    { path: `oscillators.${index}.enabled`, value: true },
    { path: `oscillators.${index}.wavetableId`, value: timbre.wavetableId },
    { path: `oscillators.${index}.wavetablePosition`, value: op.position ?? timbre.position },
  ] as RawChange[])
}
