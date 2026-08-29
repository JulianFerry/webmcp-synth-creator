import type { ComponentProps } from 'react'

import type { SupportedPatchPath } from '../../patch/paths'
import type { OscillatorState, WavetableState } from '../../patch/types'
import { renderWavetablePosition, wavetableSupportsMorphing } from '../../wavetables/render'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'
import { buildWaveformPath } from '../visualizations'

export interface DetailedOscillatorEditorProps {
  index: 0 | 1 | 2
  oscillator: OscillatorState
  previewPosition: number
  resetKey: number
  wavetables: WavetableState[]
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

type OscillatorField = keyof OscillatorState

const percent = (value: number) => `${Math.round(value * 100)}%`

export function DetailedOscillatorEditor({
  index,
  oscillator,
  previewPosition,
  resetKey,
  wavetables,
  onChange,
  onPreview,
  onCancelPreview,
}: DetailedOscillatorEditorProps) {
  const number = index + 1
  const path = (field: OscillatorField) => `oscillators.${index}.${field}` as SupportedPatchPath
  const wavetable = wavetables.find(({ id }) => id === oscillator.wavetableId) as WavetableState
  const canMorph = wavetableSupportsMorphing(wavetable)
  const displayedPosition = canMorph ? previewPosition : 0
  const waveformPath = buildWaveformPath(renderWavetablePosition(wavetable, displayedPosition, 96))
  const commit = (field: OscillatorField, value: unknown, label: string) =>
    onChange(path(field), value, `Set oscillator ${number} ${label}`)
  const preview = (field: OscillatorField): Pick<ComponentProps<typeof ParameterSlider>, 'onPreview' | 'onCancel' | 'resetKey'> => ({
    onPreview: (value) => onPreview(path(field), value),
    onCancel: () => onCancelPreview(path(field)),
    resetKey,
  })
  const staticExplanationId = `oscillator-${number}-static-position`
  const editExplanationId = `oscillator-${number}-edit-coming-soon`

  return (
    <article className="panel detailed-oscillator-editor" data-testid={`oscillator-${number}-editor`}>
      <header className="detailed-oscillator-header">
        <div>
          <p className="eyebrow">Spectral source {String(number).padStart(2, '0')}</p>
          <h2>Oscillator {number}</h2>
        </div>
        <ToggleControl checked={oscillator.enabled} label={`Oscillator ${number}`} onCommit={(enabled) => commit('enabled', enabled, enabled ? 'on' : 'off')} testId={`oscillator-${number}-enabled`} />
        <ParameterSelect id={`oscillator-${number}-wavetable`} label="Source" value={oscillator.wavetableId} options={wavetables.map(({ id, name }) => ({ value: id, label: name.replace('Generated ', '') }))} onCommit={(value) => commit('wavetableId', value, 'wavetable')} testId={`oscillator-${number}-wavetable`} />
      </header>

      <div className="wavetable-display detailed-oscillator-waveform">
        <svg aria-label={`${wavetable.name} waveform at ${canMorph ? percent(displayedPosition) : 'its single static frame'}`} className="wavetable-plot" data-testid={`oscillator-${number}-waveform`} role="img" viewBox="0 0 100 52">
          <path className="waveform-line" d={waveformPath} />
        </svg>
        <div className="wavetable-caption"><span>{wavetable.name}</span><strong>{canMorph ? percent(displayedPosition) : 'Static'}</strong></div>
        <small>{canMorph ? `${wavetable.frames.length} morph frames` : 'One frame - position unavailable'}</small>
      </div>

      <fieldset className="oscillator-control-group">
        <legend>Tuning</legend>
        <ParameterSlider id={`oscillator-${number}-transpose`} label="Transpose" min={-24} max={24} step={1} value={oscillator.transposeSemitones} formatValue={(value) => `${value > 0 ? '+' : ''}${value} st`} onCommit={(value) => commit('transposeSemitones', value, 'transpose')} testId={`oscillator-${number}-transpose`} {...preview('transposeSemitones')} />
        <ParameterSlider id={`oscillator-${number}-fine`} label="Fine tune" min={-100} max={100} step={1} value={oscillator.fineTuneCents} formatValue={(value) => `${value > 0 ? '+' : ''}${value} ct`} onCommit={(value) => commit('fineTuneCents', value, 'fine tuning')} testId={`oscillator-${number}-fine`} {...preview('fineTuneCents')} />
      </fieldset>

      <fieldset className="oscillator-control-group">
        <legend>Voicing</legend>
        <ParameterSlider id={`oscillator-${number}-unison`} label="Unison voices" min={1} max={8} step={1} value={oscillator.unisonVoices} formatValue={(value) => `${value} voices`} onCommit={(value) => commit('unisonVoices', value, 'unison voices')} testId={`oscillator-${number}-unison`} {...preview('unisonVoices')} />
        <ParameterSlider id={`oscillator-${number}-detune`} label="Detune" min={0} max={1} step={0.01} value={oscillator.unisonDetune} formatValue={percent} onCommit={(value) => commit('unisonDetune', value, 'unison detune')} testId={`oscillator-${number}-detune`} {...preview('unisonDetune')} />
        <ParameterSlider id={`oscillator-${number}-spread`} label="Stereo spread" min={0} max={1} step={0.01} value={oscillator.stereoSpread} formatValue={percent} onCommit={(value) => commit('stereoSpread', value, 'stereo spread')} testId={`oscillator-${number}-spread`} {...preview('stereoSpread')} />
        <ParameterSlider id={`oscillator-${number}-random-phase`} label="Random phase" min={0} max={1} step={0.01} value={oscillator.randomPhase} formatValue={percent} onCommit={(value) => commit('randomPhase', value, 'random phase')} testId={`oscillator-${number}-random-phase`} {...preview('randomPhase')} />
      </fieldset>

      <fieldset className="oscillator-control-group">
        <legend>Mix</legend>
        <ParameterSlider id={`oscillator-${number}-position`} label="Position" min={0} max={1} step={0.01} value={oscillator.wavetablePosition} disabled={!canMorph} describedBy={!canMorph ? staticExplanationId : undefined} formatValue={canMorph ? percent : () => 'Static'} onCommit={(value) => commit('wavetablePosition', value, 'wavetable position')} testId={`oscillator-${number}-position`} {...preview('wavetablePosition')} />
        <ParameterSlider id={`oscillator-${number}-level`} label="Level" min={0} max={1} step={0.01} value={oscillator.level} formatValue={percent} onCommit={(value) => commit('level', value, 'level')} testId={`oscillator-${number}-level`} {...preview('level')} />
      </fieldset>

      <span className="visually-hidden" id={staticExplanationId}>Position is unavailable because this wavetable has one static frame.</span>
      <span className="visually-hidden" id={editExplanationId}>Raw frame and harmonic editing is coming soon.</span>
      <footer><button aria-describedby={editExplanationId} aria-disabled="true" className="button oscillator-edit-button" disabled type="button">Edit wavetable</button></footer>
    </article>
  )
}
