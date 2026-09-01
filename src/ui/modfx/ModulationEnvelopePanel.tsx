import type { SupportedPatchPath } from '../../patch/paths'
import type { EnvelopeState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { EditableEnvelopeGraph } from '../editors/EditableEnvelopeGraph'
import { ENVELOPE_HANDLE_FIELDS, type EnvelopeHandle } from '../editors/envelopeHandles'

interface ModulationEnvelopePanelProps {
  envelope: EnvelopeState
  previewEnvelope: EnvelopeState
  resetKey: number
  onCancelPreview: (path: SupportedPatchPath) => void
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
}

const seconds = (value: number) => value < 1
  ? `${Math.round(value * 1000)} ms`
  : `${value.toFixed(2)} s`

export function ModulationEnvelopePanel({
  envelope,
  previewEnvelope,
  resetKey,
  onCancelPreview,
  onChange,
  onPreview,
}: ModulationEnvelopePanelProps) {
  const path = (field: keyof EnvelopeState) => `modEnvelope.${field}` as SupportedPatchPath
  const commit = (field: keyof EnvelopeState, value: number, label: string) =>
    onChange(path(field), value, `Set modulation envelope ${label}`)
  const commitHandle = (handle: EnvelopeHandle, value: number) =>
    commit(ENVELOPE_HANDLE_FIELDS[handle], value, handle)

  return <article className="panel modfx-envelope-panel">
    <div className="panel-heading">
      <div><p className="eyebrow">Direct modulation source</p><h2>ENV 2</h2></div>
      <span className="version-chip envelope-type-chip">AHDSR</span>
    </div>
    <EditableEnvelopeGraph
      envelope={envelope}
      previewEnvelope={previewEnvelope}
      resetKey={resetKey}
      onCancel={(handle) => onCancelPreview(path(ENVELOPE_HANDLE_FIELDS[handle]))}
      onCommit={commitHandle}
      onPreview={(handle, value) => onPreview(path(ENVELOPE_HANDLE_FIELDS[handle]), value)}
      testIdPrefix="mod"
    />
    <div className="control-grid envelope-controls">
      <ParameterSlider formatValue={seconds} id="mod-envelope-attack" label="Attack" max={3} min={0} onCancel={() => onCancelPreview(path('attackSeconds'))} onCommit={(value) => commit('attackSeconds', value, 'attack')} onPreview={(value) => onPreview(path('attackSeconds'), value)} resetKey={resetKey} step={.01} testId="mod-envelope-attack" value={envelope.attackSeconds} />
      <ParameterSlider formatValue={seconds} id="mod-envelope-hold" label="Hold" max={4} min={0} onCancel={() => onCancelPreview(path('holdSeconds'))} onCommit={(value) => commit('holdSeconds', value, 'hold')} onPreview={(value) => onPreview(path('holdSeconds'), value)} resetKey={resetKey} step={.01} testId="mod-envelope-hold" value={envelope.holdSeconds} />
      <ParameterSlider formatValue={seconds} id="mod-envelope-decay" label="Decay" max={5} min={0} onCancel={() => onCancelPreview(path('decaySeconds'))} onCommit={(value) => commit('decaySeconds', value, 'decay')} onPreview={(value) => onPreview(path('decaySeconds'), value)} resetKey={resetKey} step={.01} testId="mod-envelope-decay" value={envelope.decaySeconds} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="mod-envelope-sustain" label="Sustain" max={1} min={0} onCancel={() => onCancelPreview(path('sustainLevel'))} onCommit={(value) => commit('sustainLevel', value, 'sustain')} onPreview={(value) => onPreview(path('sustainLevel'), value)} resetKey={resetKey} step={.01} testId="mod-envelope-sustain" value={envelope.sustainLevel} />
      <ParameterSlider formatValue={seconds} id="mod-envelope-release" label="Release" max={8} min={0} onCancel={() => onCancelPreview(path('releaseSeconds'))} onCommit={(value) => commit('releaseSeconds', value, 'release')} onPreview={(value) => onPreview(path('releaseSeconds'), value)} resetKey={resetKey} step={.01} testId="mod-envelope-release" value={envelope.releaseSeconds} />
    </div>
  </article>
}
