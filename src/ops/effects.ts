import type { Operation, RawChange } from './types'
import { normalizedToReverbDecaySeconds } from './normalization'

export function resolveWidth(op: Extract<Operation, { op: 'width' }>): RawChange[] {
  const method = op.method ?? 'auto'
  const changes: RawChange[] = []
  if (method === 'unison' || method === 'auto') changes.push(
    { path: 'oscillators.0.unisonVoices', value: Math.min(8, Math.max(1, Math.round(1 + op.amount * 8))) },
    { path: 'oscillators.0.unisonDetune', value: op.amount * 0.7 },
    { path: 'oscillators.0.stereoSpread', value: 0.3 + op.amount * 0.7 },
  )
  if (method === 'pan') changes.push(
    { path: 'oscillators.0.pan', value: 0.5 - op.amount * 0.3 },
    { path: 'oscillators.1.pan', value: 0.5 + op.amount * 0.3 },
  )
  if (method === 'stereo_fx' || (method === 'auto' && op.amount >= 0.6)) changes.push(
    { path: 'effects.chorus.enabled', value: op.amount > 0.2 },
    { path: 'effects.chorus.mix', value: op.amount * 0.5 },
  )
  return changes
}

export function resolveSpace(op: Extract<Operation, { op: 'space' }>): RawChange[] {
  const changes: RawChange[] = [
    { path: 'effects.reverb.enabled', value: op.amount > 0.02 },
    { path: 'effects.reverb.mix', value: op.amount * 0.75 },
    { path: 'effects.reverb.size', value: op.size ?? (0.3 + op.amount * 0.5) },
    { path: 'effects.reverb.decaySeconds', value: normalizedToReverbDecaySeconds(0.3 + op.amount * 0.5) },
    { path: 'effects.reverb.predelay', value: op.predelay ?? 0.1 },
  ]
  if (op.delay_amount !== undefined) changes.push(
    { path: 'effects.delay.enabled', value: op.delay_amount > 0.02 },
    { path: 'effects.delay.mix', value: op.delay_amount * 0.6 },
    { path: 'effects.delay.mode', value: 'sync' },
    { path: 'effects.delay.division', value: '1/8' },
    { path: 'effects.delay.feedback', value: 0.2 + op.delay_amount * 0.4 },
  )
  return changes
}

export function resolveDrive(op: Extract<Operation, { op: 'drive' }>): RawChange[] {
  const types = { soft: 'soft_clip', hard: 'hard_clip', fold: 'sine_fold', crush: 'bit_crush' } as const
  return [
    { path: 'effects.distortion.enabled', value: op.amount > 0.02 },
    { path: 'effects.distortion.type', value: types[op.character ?? 'soft'] },
    { path: 'effects.distortion.drive', value: op.amount },
    { path: 'effects.distortion.mix', value: 0.4 + op.amount * 0.6 },
    { path: 'filter.drive', value: op.amount * 0.4 },
  ]
}
