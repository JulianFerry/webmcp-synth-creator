import type { SupportedPatchPath } from '../patch/paths'
import type { EnvelopeState, ModulationRoute } from '../patch/types'
import { ParameterSlider } from './controls/ParameterSlider'
import { createEnvelopePlot } from './visualizations'

interface ModulationPanelProps {
  envelope: EnvelopeState
  modulations: ModulationRoute[]
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
}

function seconds(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`
}

function routeLabel(route: ModulationRoute): string {
  return `${route.source === 'lfo1' ? 'LFO' : 'ENV 2'} -> ${route.destination}`
}

export function ModulationPanel({
  envelope,
  modulations,
  resetKey,
  onChange,
}: ModulationPanelProps) {
  const plot = createEnvelopePlot(envelope)
  const commit = (field: keyof EnvelopeState, value: number) =>
    onChange(`modEnvelope.${field}` as SupportedPatchPath, value, `Set modulation envelope ${field}`)

  return (
    <article className="panel modulation-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Closed destination matrix</p>
          <h2>Modulation</h2>
        </div>
        <span className="count-chip" data-testid="modulation-route-count">
          {modulations.length} routes
        </span>
      </div>

      <svg
        aria-label="Modulation envelope"
        className="envelope-plot modulation-envelope-plot"
        role="img"
        viewBox="0 0 100 72"
      >
        <path className="plot-grid" d="M0 18H100M0 36H100M0 54H100M25 0V72M50 0V72M75 0V72" />
        <path className="plot-line" d={plot.path} data-testid="mod-envelope-path" />
      </svg>

      <div className="control-grid modulation-envelope-controls">
        <ParameterSlider
          formatValue={seconds}
          id="mod-envelope-attack"
          label="ENV 2 attack"
          max={3}
          min={0}
          onCommit={(value) => commit('attackSeconds', value)}
          resetKey={resetKey}
          step={0.01}
          testId="mod-envelope-attack"
          value={envelope.attackSeconds}
        />
        <ParameterSlider
          formatValue={seconds}
          id="mod-envelope-decay"
          label="ENV 2 decay"
          max={5}
          min={0}
          onCommit={(value) => commit('decaySeconds', value)}
          resetKey={resetKey}
          step={0.01}
          testId="mod-envelope-decay"
          value={envelope.decaySeconds}
        />
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 100)}%`}
          id="mod-envelope-sustain"
          label="ENV 2 sustain"
          max={1}
          min={0}
          onCommit={(value) => commit('sustainLevel', value)}
          resetKey={resetKey}
          step={0.01}
          testId="mod-envelope-sustain"
          value={envelope.sustainLevel}
        />
        <ParameterSlider
          formatValue={seconds}
          id="mod-envelope-release"
          label="ENV 2 release"
          max={8}
          min={0}
          onCommit={(value) => commit('releaseSeconds', value)}
          resetKey={resetKey}
          step={0.01}
          testId="mod-envelope-release"
          value={envelope.releaseSeconds}
        />
      </div>

      <ol className="route-list" data-testid="modulation-routes">
        {modulations.map((route) => (
          <li key={route.id}>
            <span>{routeLabel(route)}</span>
            <strong>{route.amount > 0 ? '+' : ''}{route.amount.toFixed(2)}</strong>
            <small>{route.bipolar ? 'bipolar' : 'unipolar'}</small>
          </li>
        ))}
      </ol>
    </article>
  )
}
