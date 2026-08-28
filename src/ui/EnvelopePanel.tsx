import type { SupportedPatchPath } from '../patch/paths'
import type { EnvelopeState } from '../patch/types'
import { ParameterSlider } from './controls/ParameterSlider'
import { createEnvelopePlot } from './visualizations'

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
    return onChange(path(field), value, `Set amp envelope ${label}`)
  }
  const plot = createEnvelopePlot(previewEnvelope)

  return (
    <article className="panel envelope-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Amplitude contour</p>
          <h2>Amp envelope</h2>
        </div>
        <span className="version-chip">ADSR</span>
      </div>

      <svg
        aria-label={`ADSR amplitude envelope: attack ${seconds(previewEnvelope.attackSeconds)}, decay ${seconds(previewEnvelope.decaySeconds)}, sustain ${Math.round(previewEnvelope.sustainLevel * 100)} percent, release ${seconds(previewEnvelope.releaseSeconds)}`}
        className="envelope-plot"
        role="img"
        viewBox="0 0 100 72"
      >
        <path className="plot-grid" d="M0 18H100M0 36H100M0 54H100M25 0V72M50 0V72M75 0V72" />
        <path className="plot-line" d={plot.path} data-testid="amp-envelope-path" />
        <g className="envelope-phase-labels" aria-hidden="true">
          <text x={(2 + plot.attackEndX) / 2} y="70">A</text>
          <text x={(plot.attackEndX + plot.decayEndX) / 2} y="70">D</text>
          <text x={(plot.decayEndX + plot.releaseStartX) / 2} y="70">S</text>
          <text x={(plot.releaseStartX + 98) / 2} y="70">R</text>
        </g>
      </svg>

      <div className="control-grid envelope-controls">
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
          value={envelope.attackSeconds}
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
          value={envelope.decaySeconds}
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
          value={envelope.sustainLevel}
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
          value={envelope.releaseSeconds}
        />
      </div>
      <p className="gesture-note envelope-preview-note">
        Sustain previews held notes. Attack and decay start with the next note; release commits
        for the held note&apos;s later note-off without reshaping it now.
      </p>
    </article>
  )
}
