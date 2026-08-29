import { TEMPO_SYNC_DIVISIONS } from '../patch/limits'
import type { SupportedPatchPath } from '../patch/paths'
import type { LfoRate, LfoState } from '../patch/types'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { ToggleControl } from './controls/ToggleControl'
import { EditableLfoGraph } from './editors/EditableLfoGraph'

interface LfoPanelProps {
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

export function LfoPanel({ lfo, resetKey, onChange }: LfoPanelProps) {
  const commitRate = (rate: LfoRate) => onChange('lfo1.rate', rate, 'Set LFO 1 rate')

  return (
    <article className="panel lfo-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Structured modulation source</p>
          <h2>LFO 1</h2>
        </div>
        <ToggleControl
          checked={lfo.enabled}
          label="LFO 1"
          onCommit={(enabled) => onChange('lfo1.enabled', enabled, 'Set LFO 1 enablement')}
          testId="lfo-enabled"
        />
      </div>

      <figure className="lfo-plot" data-enabled={lfo.enabled} data-testid="lfo-shape">
        <EditableLfoGraph
          onCommit={(points) => onChange('lfo1.points', points, 'Edit LFO 1 shape')}
          points={lfo.points}
          resetKey={resetKey}
          smooth={lfo.smooth}
        />
        <figcaption>
          <span data-testid="lfo-point-count">{lfo.points.length} points</span>
          <span data-testid="lfo-rate-readout">{rateLabel(lfo.rate)}</span>
          <strong>{lfo.enabled ? 'modulation enabled' : 'modulation disabled'}</strong>
        </figcaption>
      </figure>

      <div className="control-grid lfo-controls">
        <ParameterSelect
          id="lfo-rate-mode"
          label="Rate mode"
          onCommit={(mode) =>
            commitRate(
              mode === 'sync'
                ? { mode: 'sync', division: lfo.rate.mode === 'sync' ? lfo.rate.division : '1/8' }
                : { mode: 'free', hz: lfo.rate.mode === 'free' ? lfo.rate.hz : 1 },
            )
          }
          options={[
            { value: 'sync', label: 'Tempo sync' },
            { value: 'free', label: 'Free rate' },
          ]}
          testId="lfo-rate-mode"
          value={lfo.rate.mode}
        />
        {lfo.rate.mode === 'sync' ? (
          <ParameterSelect
            id="lfo-sync-division"
            label="Division"
            onCommit={(division) => commitRate({ mode: 'sync', division })}
            options={SYNC_DIVISIONS}
            testId="lfo-sync-division"
            value={lfo.rate.division}
          />
        ) : (
          <ParameterSlider
            formatValue={(value) => `${value.toFixed(2)} Hz`}
            id="lfo-free-rate"
            label="Frequency"
            max={20}
            min={0.01}
            onCommit={(hz) => commitRate({ mode: 'free', hz })}
            resetKey={resetKey}
            step={0.01}
            testId="lfo-free-rate"
            value={lfo.rate.hz}
          />
        )}
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 360)} deg`}
          id="lfo-phase"
          label="Phase"
          max={1}
          min={0}
          onCommit={(phase) => onChange('lfo1.phase', phase, 'Set LFO 1 phase')}
          resetKey={resetKey}
          step={0.01}
          testId="lfo-phase"
          value={lfo.phase}
        />
        <ParameterSelect
          id="lfo-shape-mode"
          label="Shape mode"
          onCommit={(mode) =>
            onChange('lfo1.smooth', mode === 'smooth', `Set LFO 1 shape mode to ${mode}`)
          }
          options={[
            { value: 'smooth', label: 'Smooth' },
            { value: 'precise', label: 'Precise' },
          ]}
          testId="lfo-smooth"
          value={lfo.smooth ? 'smooth' : 'precise'}
        />
      </div>
      <p className="gesture-note">Drag points to shape the cycle, double-click to add, and press Delete to remove. Each gesture creates one history entry.</p>
    </article>
  )
}
