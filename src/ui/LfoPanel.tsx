import { TEMPO_SYNC_DIVISIONS } from '../patch/limits'
import type { SupportedPatchPath } from '../patch/paths'
import type { LfoRate, LfoState } from '../patch/types'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { ToggleControl } from './controls/ToggleControl'
import { EditableLfoGraph } from './editors/EditableLfoGraph'

interface LfoPanelProps {
  slot: 1 | 2
  lfo: LfoState
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
}

const SYNC_DIVISIONS = TEMPO_SYNC_DIVISIONS.map((value) => ({
  value,
  label: value.endsWith('T') ? `${value.slice(0, -1)} triplet` : value,
}))

function rateLabel(rate: LfoRate): string {
  return rate.mode === 'sync' ? rate.division : `${rate.hz.toFixed(2)} Hz`
}

export function LfoPanel({ slot, lfo, resetKey, onChange }: LfoPanelProps) {
  const prefix = `lfo${slot}` as const
  const testId = `lfo-${slot}`
  const label = slot === 1 ? 'LFO 1 · Gate' : 'LFO 2 · Movement'
  const path = (field: keyof LfoState) => `${prefix}.${field}` as SupportedPatchPath
  const commitRate = (rate: LfoRate) => onChange(path('rate'), rate, `Set LFO ${slot} rate`)
  const commitTarget = (target: LfoState['target']) => {
    if (target === 'cutoff' && lfo.scope !== 'all') onChange(path('scope'), 'all', `Set LFO ${slot} scope`)
    return onChange(path('target'), target, `Set LFO ${slot} target`)
  }

  return (
    <article className={`panel lfo-panel${lfo.enabled ? '' : ' is-disabled'}`}>
      <div className="panel-heading">
        <div>
          <h2>{label}</h2>
        </div>
        <ToggleControl
          checked={lfo.enabled}
          label={`LFO ${slot}`}
          onCommit={(enabled) => onChange(path('enabled'), enabled, `Set LFO ${slot} enablement`)}
          testId={`${testId}-enabled`}
        />
      </div>

      <figure className="lfo-plot" data-enabled={lfo.enabled} data-testid={`${testId}-shape`}>
        <EditableLfoGraph
          onCommit={(points) => onChange(path('points'), points, `Edit LFO ${slot} shape`)}
          points={lfo.points}
          resetKey={resetKey}
          smooth={lfo.smooth}
          testIdPrefix={testId}
        />
        <figcaption className="visually-hidden">
          <span data-testid={`${testId}-point-count`}>{lfo.points.length} points</span>
          <span data-testid={`${testId}-rate-readout`}>{rateLabel(lfo.rate)}</span>
          <strong>{lfo.enabled ? 'modulation enabled' : 'modulation disabled'}</strong>
        </figcaption>
      </figure>

      <div className="lfo-routing-readout" data-testid={`${testId}-routing-readout`}>
        <span>{lfo.target}</span><span>{lfo.scope === 'all' ? 'all oscillators' : `oscillator ${lfo.scope}`}</span><strong>{Math.round(lfo.depth * 100)}%</strong>
      </div>

      <div className="control-grid lfo-controls">
        {lfo.rate.mode === 'sync' ? (
          <ParameterSelect
            id={`${testId}-sync-division`}
            label="Division"
            onCommit={(division) => commitRate({ mode: 'sync', division })}
            options={SYNC_DIVISIONS}
            testId={`${testId}-sync-division`}
            value={lfo.rate.division}
          />
        ) : (
          <ParameterSlider
            formatValue={(value) => `${value.toFixed(2)} Hz`}
            id={`${testId}-free-rate`}
            label="Frequency"
            max={20}
            min={0.01}
            onCommit={(hz) => commitRate({ mode: 'free', hz })}
            resetKey={resetKey}
            step={0.01}
            testId={`${testId}-free-rate`}
            value={lfo.rate.hz}
          />
        )}
        <ParameterSelect
          id={`${testId}-shape-mode`}
          label="Shape mode"
          onCommit={(mode) =>
            onChange(path('smooth'), mode === 'smooth', `Set LFO ${slot} shape mode to ${mode}`)
          }
          options={[
            { value: 'smooth', label: 'Smooth' },
            { value: 'precise', label: 'Precise' },
          ]}
          testId={`${testId}-smooth`}
          value={lfo.smooth ? 'smooth' : 'precise'}
        />
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 360)} deg`}
          id={`${testId}-phase`}
          label="Phase"
          max={1}
          min={0}
          onCommit={(phase) => onChange(path('phase'), phase, `Set LFO ${slot} phase`)}
          resetKey={resetKey}
          step={0.01}
          testId={`${testId}-phase`}
          value={lfo.phase}
        />
        <ParameterSelect id={`${testId}-target`} label="Target" onCommit={commitTarget} options={[
          { value: 'level', label: 'Level' }, { value: 'position', label: 'Position' },
          { value: 'pitch', label: 'Pitch' }, { value: 'cutoff', label: 'Cutoff' },
        ]} testId={`${testId}-target`} value={lfo.target} />
        <ParameterSelect id={`${testId}-scope`} label="Scope" onCommit={(scope) => onChange(path('scope'), scope === 'all' ? 'all' : Number(scope), `Set LFO ${slot} scope`)} options={[
          { value: 'all', label: 'All' }, { value: '1', label: 'Osc 1' }, { value: '2', label: 'Osc 2' }, { value: '3', label: 'Osc 3' },
        ]} testId={`${testId}-scope`} value={String(lfo.scope)} />
        <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id={`${testId}-depth`} label="Depth" max={1} min={0} onCommit={(depth) => onChange(path('depth'), depth, `Set LFO ${slot} depth`)} resetKey={resetKey} step={0.01} testId={`${testId}-depth`} value={lfo.depth} />
      </div>
    </article>
  )
}
