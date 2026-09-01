import type { BrowserSynthState } from '../../audio/BrowserSynth'
import type { SupportedPatchPath } from '../../patch/paths'
import type { PatchState } from '../../patch/types'
import { DelayEditor } from '../modfx/DelayEditor'
import { EffectsGrid, type EffectDefinition } from '../modfx/EffectsGrid'
import { FilterEditor } from '../modfx/FilterEditor'
import { ReverbEditor } from '../modfx/ReverbEditor'

interface ModulationEffectsTabProps {
  audio: BrowserSynthState
  patch: PatchState
  resetKey: number
  onCancelPreview: (path: SupportedPatchPath) => void
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
}

export function ModulationEffectsTab({ audio, patch, resetKey, onCancelPreview, onChange, onPreview }: ModulationEffectsTabProps) {
  const path = (value: string) => value as SupportedPatchPath
  const editor = ({ id, name, description }: EffectDefinition) => {
    if (id === 'filter') return <FilterEditor filter={patch.filter} previewFilter={audio.draft.filter} resetKey={resetKey} onCancelPreview={onCancelPreview} onChange={onChange} onPreview={onPreview} />
    if (id === 'delay') return <DelayEditor delay={patch.effects.delay} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.delay.${field}`), value, `Set delay ${field}`)} />
    if (id === 'reverb') return <ReverbEditor reverb={patch.effects.reverb} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.reverb.${field}`), value, `Set reverb ${field}`)} />
    return <article className={`panel effect-editor processor-slot processor-slot-${id}`}>
      <div className="panel-heading"><div><p className="eyebrow">Processor slot</p><h2>{name}</h2></div><span className="version-chip">FX</span></div>
      <div className="processor-slot-visual" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <p className="processor-slot-description">{description}. Drag the grip to reorder this processor.</p>
    </article>
  }

  return <EffectsGrid
    onOrderChange={(order) => onChange(path('effects.order'), order, 'Reorder effects')}
    order={patch.effects.order}
    renderEffect={editor}
  />
}
