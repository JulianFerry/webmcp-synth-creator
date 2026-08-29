import type { BrowserSynthState } from '../../audio/BrowserSynth'
import type { SupportedPatchPath } from '../../patch/paths'
import type { PatchState } from '../../patch/types'
import { EditableEnvelopeGraph } from '../editors/EditableEnvelopeGraph'
import type { EnvelopeHandle } from '../editors/envelopeHandles'
import { EditableLfoGraph } from '../editors/EditableLfoGraph'
import { DelayEditor } from '../modfx/DelayEditor'
import { FilterEditor } from '../modfx/FilterEditor'
import { ModulationMatrixEditor } from '../modfx/ModulationMatrixEditor'
import { ReverbEditor } from '../modfx/ReverbEditor'
import { SignalFlowOverview } from '../modfx/SignalFlowOverview'
import { VoiceEditor } from '../modfx/VoiceEditor'

interface ModulationEffectsTabProps {
  audio: BrowserSynthState
  patch: PatchState
  resetKey: number
  onCancelPreview: (path: SupportedPatchPath) => void
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
}

const envelopeField = { attack: 'attackSeconds', decay: 'decaySeconds', sustain: 'sustainLevel', release: 'releaseSeconds' } as const

export function ModulationEffectsTab({ audio, patch, resetKey, onCancelPreview, onChange, onPreview }: ModulationEffectsTabProps) {
  const path = (value: string) => value as SupportedPatchPath
  const envelopePath = (handle: EnvelopeHandle) => path(`modEnvelope.${envelopeField[handle]}`)
  return <div className="modfx-workspace">
    <SignalFlowOverview modulations={patch.modulations} patch={patch} />
    <div className="modfx-modulators">
      <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Direct modulation source</p><h2>ENV 2</h2></div></div><EditableEnvelopeGraph envelope={patch.modEnvelope} previewEnvelope={audio.draft.modEnvelope} resetKey={resetKey} onCancel={(handle) => onCancelPreview(envelopePath(handle))} onCommit={(handle, value) => onChange(envelopePath(handle), value, `Set modulation envelope ${envelopeField[handle]}`)} onPreview={(handle, value) => onPreview(envelopePath(handle), value)} /></article>
      <article className="panel"><div className="panel-heading"><div><p className="eyebrow">Direct modulation source</p><h2>LFO 1</h2></div></div><EditableLfoGraph points={patch.lfo1.points} smooth={patch.lfo1.smooth} resetKey={resetKey} onCommit={(points) => onChange(path('lfo1.points'), points, 'Set LFO shape')} /></article>
    </div>
    <ModulationMatrixEditor modulations={patch.modulations} resetKey={resetKey} onChange={(routes) => onChange(path('modulations'), routes, 'Set modulation routes')} />
    <div className="modfx-processors">
      <FilterEditor filter={patch.filter} previewFilter={audio.draft.filter} resetKey={resetKey} onCancelPreview={onCancelPreview} onChange={onChange} onPreview={onPreview} />
      <DelayEditor delay={patch.effects.delay} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.delay.${field}`), value, `Set delay ${field}`)} />
      <ReverbEditor reverb={patch.effects.reverb} resetKey={resetKey} onChange={(field, value) => onChange(path(`effects.reverb.${field}`), value, `Set reverb ${field}`)} />
      <VoiceEditor voice={patch.voice} resetKey={resetKey} onChange={(field, value) => onChange(path(`voice.${field}`), value, `Set voice ${field}`)} />
    </div>
  </div>
}
