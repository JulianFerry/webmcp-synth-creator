import type { SupportedPatchPath } from '../patch/paths'
import type { EnvelopeState } from '../patch/types'
import { ParameterSlider } from './controls/ParameterSlider'
import { EditableEnvelopeGraph } from './editors/EditableEnvelopeGraph'
import { ENVELOPE_HANDLE_FIELDS, type EnvelopeHandle } from './editors/envelopeHandles'

interface EnvelopePanelProps {
  envelope: EnvelopeState
  previewEnvelope: EnvelopeState
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

function seconds(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`
}

export function EnvelopePanel({
  envelope,
  previewEnvelope,
  resetKey,
  onChange,
  onPreview,
  onCancelPreview,
}: EnvelopePanelProps) {
  const path = (field: keyof EnvelopeState) => `ampEnvelope.${field}` as SupportedPatchPath
  const commit = (field: keyof EnvelopeState, value: number, label: string) => {
    return onChange(path(field), value, `Set amplitude envelope ${label}`)
  }
  const commitHandle = (handle: EnvelopeHandle, value: number) =>
    commit(ENVELOPE_HANDLE_FIELDS[handle], value, handle)

  return (
    <article className="panel envelope-panel">
      <div className="panel-heading">
        <div>
          <h2>Amplitude envelope</h2>
        </div>
        <span className="version-chip envelope-type-chip">AHDSR</span>
      </div>

      <EditableEnvelopeGraph
        envelope={envelope}
        onCancel={(handle) => onCancelPreview(path(ENVELOPE_HANDLE_FIELDS[handle]))}
        onCommit={commitHandle}
        onPreview={(handle, value) => onPreview(path(ENVELOPE_HANDLE_FIELDS[handle]), value)}
        previewEnvelope={previewEnvelope}
        resetKey={resetKey}
      />

      <div className="control-grid envelope-controls">
        <ParameterSlider
          formatValue={seconds}
          id="amp-delay"
          label="Delay"
          max={4}
          min={0}
          onCancel={() => onCancelPreview(path('delaySeconds'))}
          onCommit={(value) => commit('delaySeconds', value, 'delay')}
          onPreview={(value) => onPreview(path('delaySeconds'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-delay"
          value={previewEnvelope.delaySeconds}
        />
        <ParameterSlider
          formatValue={seconds}
          id="amp-attack"
          label="Attack"
          max={3}
          min={0}
          onCancel={() => onCancelPreview(path('attackSeconds'))}
          onCommit={(value) => commit('attackSeconds', value, 'attack')}
          onPreview={(value) => onPreview(path('attackSeconds'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-attack"
          value={previewEnvelope.attackSeconds}
        />
        <ParameterSlider
          formatValue={seconds}
          id="amp-hold"
          label="Hold"
          max={4}
          min={0}
          onCancel={() => onCancelPreview(path('holdSeconds'))}
          onCommit={(value) => commit('holdSeconds', value, 'hold')}
          onPreview={(value) => onPreview(path('holdSeconds'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-hold"
          value={previewEnvelope.holdSeconds}
        />
        <ParameterSlider
          formatValue={seconds}
          id="amp-decay"
          label="Decay"
          max={5}
          min={0}
          onCancel={() => onCancelPreview(path('decaySeconds'))}
          onCommit={(value) => commit('decaySeconds', value, 'decay')}
          onPreview={(value) => onPreview(path('decaySeconds'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-decay"
          value={previewEnvelope.decaySeconds}
        />
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 100)}%`}
          id="amp-sustain"
          label="Sustain"
          max={1}
          min={0}
          onCancel={() => onCancelPreview(path('sustainLevel'))}
          onCommit={(value) => commit('sustainLevel', value, 'sustain')}
          onPreview={(value) => onPreview(path('sustainLevel'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-sustain"
          value={previewEnvelope.sustainLevel}
        />
        <ParameterSlider
          formatValue={seconds}
          id="amp-release"
          label="Release"
          max={8}
          min={0}
          onCancel={() => onCancelPreview(path('releaseSeconds'))}
          onCommit={(value) => commit('releaseSeconds', value, 'release')}
          onPreview={(value) => onPreview(path('releaseSeconds'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="amp-release"
          value={previewEnvelope.releaseSeconds}
        />
        {(['attackCurve', 'decayCurve', 'releaseCurve'] as const).map((field) => <ParameterSlider
          formatValue={(value) => value.toFixed(2)}
          id={`amp-${field.replace('Curve', '-curve')}`}
          key={field}
          label={field.replace('Curve', ' curve')}
          max={1}
          min={-1}
          onCancel={() => onCancelPreview(path(field))}
          onCommit={(value) => commit(field, value, field.replace('Curve', ' curve'))}
          onPreview={(value) => onPreview(path(field), value)}
          resetKey={resetKey}
          step={0.01}
          testId={`amp-${field.replace('Curve', '-curve')}`}
          value={previewEnvelope[field]}
        />)}
      </div>
    </article>
  )
}
