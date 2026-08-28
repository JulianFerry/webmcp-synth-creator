import type { SupportedPatchPath } from '../patch/paths'
import type { OscillatorState, WavetableState } from '../patch/types'
import { renderWavetablePosition, wavetableSupportsMorphing } from '../wavetables/render'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { ToggleControl } from './controls/ToggleControl'
import { buildWaveformPath } from './visualizations'

interface OscillatorPanelProps {
  index: 0 | 1
  oscillator: OscillatorState
  previewPosition: number
  resetKey: number
  wavetables: WavetableState[]
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

type OscillatorField = Exclude<keyof OscillatorState, 'wavetableId'> | 'wavetableId'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function OscillatorPanel({
  index,
  oscillator,
  previewPosition,
  resetKey,
  wavetables,
  onChange,
  onPreview,
  onCancelPreview,
}: OscillatorPanelProps) {
  const number = index + 1
  const path = (field: OscillatorField) => `oscillators.${index}.${field}` as SupportedPatchPath
  const wavetable = wavetables.find((table) => table.id === oscillator.wavetableId) as WavetableState
  const canMorph = wavetableSupportsMorphing(wavetable)
  const displayedPosition = canMorph ? previewPosition : 0
  const waveformPath = buildWaveformPath(
    renderWavetablePosition(wavetable, displayedPosition, 96),
  )
  const commit = (field: OscillatorField, value: unknown, label: string) => {
    return onChange(path(field), value, `Set oscillator ${number} ${label}`)
  }
  const preview = (field: OscillatorField) => ({
    onCancel: () => onCancelPreview(path(field)),
    onPreview: (value: number) => onPreview(path(field), value),
    resetKey,
  })

  return (
    <article className="panel oscillator-panel" data-testid={`oscillator-${number}-panel`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Spectral source {String(number).padStart(2, '0')}</p>
          <h2>Oscillator {number}</h2>
        </div>
        <ToggleControl
          checked={oscillator.enabled}
          label={`Oscillator ${number}`}
          onCommit={(enabled) => commit('enabled', enabled, enabled ? 'on' : 'off')}
          testId={`oscillator-${number}-enabled`}
        />
      </div>

      <div className="wavetable-display">
        <svg
          aria-label={`${wavetable.name} waveform at ${canMorph ? percent(displayedPosition) : 'its single static frame'}`}
          className="wavetable-plot"
          data-testid={`oscillator-${number}-waveform`}
          role="img"
          viewBox="0 0 100 52"
        >
          <path className="waveform-line" d={waveformPath} />
        </svg>
        <div className="wavetable-caption">
          <span>{wavetable.name}</span>
          <strong>{canMorph ? percent(displayedPosition) : 'Static'}</strong>
        </div>
        <small data-testid={`oscillator-${number}-morph-status`}>
          {canMorph ? `${wavetable.frames.length} morph frames` : 'One frame - position unavailable'}
        </small>
      </div>

      <div className="control-grid oscillator-controls">
        <ParameterSelect
          id={`oscillator-${number}-wavetable`}
          label="Wavetable"
          onCommit={(value) => commit('wavetableId', value, 'wavetable')}
          options={wavetables.map((wavetable) => ({
            value: wavetable.id,
            label: wavetable.name.replace('Generated ', ''),
          }))}
          testId={`oscillator-${number}-wavetable`}
          value={oscillator.wavetableId}
        />
        <ParameterSlider
          formatValue={canMorph ? percent : () => 'Static'}
          id={`oscillator-${number}-position`}
          label="Position"
          max={1}
          min={0}
          disabled={!canMorph}
          onCommit={(value) => commit('wavetablePosition', value, 'wavetable position')}
          {...preview('wavetablePosition')}
          step={0.01}
          testId={`oscillator-${number}-position`}
          value={oscillator.wavetablePosition}
        />
        <ParameterSlider
          formatValue={percent}
          id={`oscillator-${number}-level`}
          label="Level"
          max={1}
          min={0}
          onCommit={(value) => commit('level', value, 'level')}
          {...preview('level')}
          step={0.01}
          testId={`oscillator-${number}-level`}
          value={oscillator.level}
        />
        <ParameterSlider
          formatValue={(value) => `${value > 0 ? '+' : ''}${value} st`}
          id={`oscillator-${number}-transpose`}
          label="Transpose"
          max={24}
          min={-24}
          onCommit={(value) => commit('transposeSemitones', value, 'transpose')}
          {...preview('transposeSemitones')}
          step={1}
          testId={`oscillator-${number}-transpose`}
          value={oscillator.transposeSemitones}
        />
        <ParameterSlider
          formatValue={(value) => `${value > 0 ? '+' : ''}${value} ct`}
          id={`oscillator-${number}-fine`}
          label="Fine"
          max={100}
          min={-100}
          onCommit={(value) => commit('fineTuneCents', value, 'fine tuning')}
          {...preview('fineTuneCents')}
          step={1}
          testId={`oscillator-${number}-fine`}
          value={oscillator.fineTuneCents}
        />
        <ParameterSlider
          formatValue={(value) => `${value} voices`}
          id={`oscillator-${number}-unison`}
          label="Unison"
          max={8}
          min={1}
          onCommit={(value) => commit('unisonVoices', value, 'unison voices')}
          {...preview('unisonVoices')}
          step={1}
          testId={`oscillator-${number}-unison`}
          value={oscillator.unisonVoices}
        />
        <ParameterSlider
          formatValue={percent}
          id={`oscillator-${number}-detune`}
          label="Detune"
          max={1}
          min={0}
          onCommit={(value) => commit('unisonDetune', value, 'unison detune')}
          {...preview('unisonDetune')}
          step={0.01}
          testId={`oscillator-${number}-detune`}
          value={oscillator.unisonDetune}
        />
        <ParameterSlider
          formatValue={percent}
          id={`oscillator-${number}-spread`}
          label="Stereo"
          max={1}
          min={0}
          onCommit={(value) => commit('stereoSpread', value, 'stereo spread')}
          {...preview('stereoSpread')}
          step={0.01}
          testId={`oscillator-${number}-spread`}
          value={oscillator.stereoSpread}
        />
      </div>
    </article>
  )
}
