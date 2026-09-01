export const EFFECT_IDS = ['distortion', 'filter', 'compressor', 'chorus', 'delay', 'reverb'] as const

export type EffectId = (typeof EFFECT_IDS)[number]

export const DEFAULT_EFFECT_ORDER: EffectId[] = [...EFFECT_IDS]
