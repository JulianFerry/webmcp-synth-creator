import type { SynthRendererState } from '../../audio/SynthRenderer'
import type { SupportedPatchPath } from '../../patch/paths'
import type { PatchState } from '../../patch/types'
import { DelayEditor } from '../modfx/DelayEditor'
import { ChorusEditor } from '../modfx/ChorusEditor'
import { DistortionEditor } from '../modfx/DistortionEditor'
import { EffectsGrid, type EffectDefinition } from '../modfx/EffectsGrid'
import { FilterEditor } from '../modfx/FilterEditor'
import { ReverbEditor } from '../modfx/ReverbEditor'
import { CompressorEditor } from '../modfx/CompressorEditor'
import { EFFECT_IDS, type EffectId } from '../../patch/effects'

export const CONCRETE_EFFECT_EDITOR_IDS = [...EFFECT_IDS] satisfies EffectId[]

interface ModulationEffectsTabProps {
  audio: SynthRendererState
  patch: PatchState
  resetKey: number
  onCancelPreview: (path: SupportedPatchPath) => void
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
}

export function ModulationEffectsTab({ audio, patch, resetKey, onCancelPreview, onChange, onPreview }: ModulationEffectsTabProps) {
  const path = (value: string) => value as SupportedPatchPath
  const editor = ({ id }: EffectDefinition) => {
    if (id === 'distortion') return <DistortionEditor distortion={patch.effects.distortion} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.distortion.${field}`), value, `Set distortion ${field}`)} />
    if (id === 'filter') return <FilterEditor filter={patch.filter} previewFilter={audio.draft.filter} resetKey={resetKey} onCancelPreview={onCancelPreview} onChange={onChange} onPreview={onPreview} />
    if (id === 'compressor') return <CompressorEditor compressor={patch.effects.compressor} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.compressor.${field}`), value, `Set compressor ${field}`)} />
    if (id === 'chorus') return <ChorusEditor chorus={patch.effects.chorus} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.chorus.${field}`), value, `Set chorus ${field}`)} />
    if (id === 'delay') return <DelayEditor delay={patch.effects.delay} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.delay.${field}`), value, `Set delay ${field}`)} />
    if (id === 'reverb') return <ReverbEditor reverb={patch.effects.reverb} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.reverb.${field}`), value, `Set reverb ${field}`)} />
    id satisfies never
    return null
  }

  return <EffectsGrid
    onOrderChange={(order) => onChange(path('effects.order'), order, 'Reorder effects')}
    order={patch.effects.order}
    renderEffect={editor}
  />
}
