import { evaluateLfoCycle } from '../audio/lfo'
import type { TempoSyncDivision } from '../patch/limits'
import type { SupportedPatchPath } from '../patch/paths'
import type { LfoState, OscillatorState } from '../patch/types'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { ToggleControl } from './controls/ToggleControl'
import { EditableLfoGraph } from './editors/EditableLfoGraph'
import { type NotePlayback, useVisualElapsedSeconds } from './useVisualElapsedSeconds'
import { lfoHasEnabledTarget } from './lfoVisualization'

interface LfoPanelProps {
  slot: 1 | 2
  lfo: LfoState
  oscillators: readonly Pick<OscillatorState, 'enabled'>[]
  notePlayback: NotePlayback
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
}

const SYNC_DIVISIONS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64'] as const

function divisionIndex(division: TempoSyncDivision): number {
  const straightDivision = division.replace(/T$/, '')
  return Math.max(0, SYNC_DIVISIONS.findIndex((candidate) => candidate === straightDivision))
}

function divisionAt(index: number): (typeof SYNC_DIVISIONS)[number] {
  return SYNC_DIVISIONS[Math.max(0, Math.min(SYNC_DIVISIONS.length - 1, Math.round(index)))] ?? SYNC_DIVISIONS[0]
}

export function LfoPanel({ slot, lfo, oscillators, notePlayback, resetKey, onChange }: LfoPanelProps) {
  const prefix = `lfo${slot}` as const
  const testId = `lfo-${slot}`
  const path = (field: keyof LfoState) => `${prefix}.${field}` as SupportedPatchPath
  const commitTarget = (target: LfoState['target']) => {
    if (target === 'cutoff' && lfo.scope !== 'all') onChange(path('scope'), 'all', `Set LFO ${slot} scope`)
    return onChange(path('target'), target, `Set LFO ${slot} target`)
  }
  const showPlayhead = notePlayback.isNotePlaying && lfo.enabled && lfoHasEnabledTarget(lfo, oscillators)
  const visualElapsedSeconds = useVisualElapsedSeconds(showPlayhead, notePlayback)
  const cycle = showPlayhead ? evaluateLfoCycle(lfo, visualElapsedSeconds) : null

  return (
    <article className={`panel lfo-panel${lfo.enabled ? '' : ' is-disabled'}`}>
      <div className="panel-heading">
        <div>
          <h2>LFO {slot}</h2>
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
          playheadPhase={cycle?.phase}
          visitedStartPhase={cycle?.visitedStartPhase}
          resetKey={resetKey}
          smooth={lfo.smooth}
          testIdPrefix={testId}
        />
        <figcaption className="visually-hidden">
          <span data-testid={`${testId}-point-count`}>{lfo.points.length} points</span>
          <span data-testid={`${testId}-rate-readout`}>{lfo.rate.division.replace(/T$/, '')}</span>
          <strong>{lfo.enabled ? 'modulation enabled' : 'modulation disabled'}</strong>
        </figcaption>
      </figure>

      <div className="control-grid lfo-controls">
        <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id={`${testId}-depth`} label="Depth" max={1} min={0} onCommit={(depth) => onChange(path('depth'), depth, `Set LFO ${slot} depth`)} resetKey={resetKey} step={0.01} testId={`${testId}-depth`} value={lfo.depth} />
        <ParameterSelect id={`${testId}-target`} label="Target" onCommit={commitTarget} options={[
          { value: 'level', label: 'Level' }, { value: 'position', label: 'Position' },
          { value: 'pitch', label: 'Pitch' }, { value: 'cutoff', label: 'Cutoff' },
        ]} testId={`${testId}-target`} value={lfo.target} />
        <ParameterSelect id={`${testId}-scope`} label="Scope" onCommit={(scope) => onChange(path('scope'), scope === 'all' ? 'all' : Number(scope), `Set LFO ${slot} scope`)} options={[
          { value: 'all', label: 'All' }, { value: '1', label: 'Osc 1' }, { value: '2', label: 'Osc 2' }, { value: '3', label: 'Osc 3' },
        ]} testId={`${testId}-scope`} value={String(lfo.scope)} />
        <ParameterSlider
            formatValue={(value) => divisionAt(value)}
            id={`${testId}-sync-division`}
            label="Division"
            max={SYNC_DIVISIONS.length - 1}
            min={0}
            onCommit={(index) => onChange(path('rate'), { mode: 'sync', division: divisionAt(index) }, `Set LFO ${slot} rate`)}
            resetKey={resetKey}
            step={1}
            testId={`${testId}-sync-division`}
            value={divisionIndex(lfo.rate.division)}
          />
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
          formatValue={(value) => `${Math.round(value * 360)}°`}
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
      </div>
    </article>
  )
}
