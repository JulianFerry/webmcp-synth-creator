import { useState, type ComponentProps } from 'react'

import type { SupportedPatchPath } from '../../patch/paths'
import type { LfoState, OscillatorState, WavetableState } from '../../patch/types'
import { renderWavetablePosition, wavetableSupportsMorphing } from '../../wavetables/render'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'
import { WavetableWaterfall } from '../overview/WavetableWaterfall'
import { buildWaveformPath } from '../visualizations'
import { OSCILLATOR_PLOT_INSET_RATIO } from '../visualizations/wavetableWaterfall'
import { type NotePlayback, useVisualElapsedSeconds } from '../useVisualElapsedSeconds'
import { evaluateOscillatorVisualModulation } from './visualLfoModulation'

export interface DetailedOscillatorEditorProps {
  index: 0 | 1 | 2
  oscillator: OscillatorState
  notePlayback: NotePlayback
  lfos: readonly [LfoState, LfoState]
  previewPosition: number
  resetKey: number
  wavetables: WavetableState[]
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

type OscillatorField = keyof OscillatorState

const percent = (value: number) => `${Math.round(value * 100)}%`
const sourceName = (name: string) => name.replace(/^Generated\s*(?:—|-)??\s*/i, '')
const fineTuneToControlValue = (cents: number) => cents / 100
const fineTuneToCents = (value: number) => Number((value * 100).toFixed(12))
const formatFineTune = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(3))}`
const phaseToControlValue = (phase: number) => phase * 360
const phaseToParameterValue = (degrees: number) => Number((degrees / 360).toFixed(12))
const formatPhase = (degrees: number) => `${Math.round(degrees)}°`

export function DetailedOscillatorEditor({
  index,
  oscillator,
  notePlayback,
  lfos,
  previewPosition,
  resetKey,
  wavetables,
  onChange,
  onPreview,
  onCancelPreview,
}: DetailedOscillatorEditorProps) {
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d')
  const number = index + 1
  const path = (field: OscillatorField) => `oscillators.${index}.${field}` as SupportedPatchPath
  const wavetable = wavetables.find(({ id }) => id === oscillator.wavetableId) as WavetableState
  const canMorph = wavetableSupportsMorphing(wavetable)
  const effectiveViewMode = canMorph ? viewMode : '2d'
  const shouldAnimatePosition = oscillator.enabled && notePlayback.isNotePlaying && canMorph && lfos.some((lfo) =>
    lfo.enabled && lfo.target === 'position' && (lfo.scope === 'all' || lfo.scope === number),
  )
  const visualElapsedSeconds = useVisualElapsedSeconds(shouldAnimatePosition, notePlayback)
  const visualModulation = evaluateOscillatorVisualModulation(
    lfos,
    number as 1 | 2 | 3,
    visualElapsedSeconds,
    previewPosition,
  )
  const displayedPosition = canMorph
    ? notePlayback.isNotePlaying && oscillator.enabled
      ? visualModulation.position
      : previewPosition
    : 0
  const plotInset = OSCILLATOR_PLOT_INSET_RATIO * 100
  const waveformPath = buildWaveformPath(renderWavetablePosition(wavetable, displayedPosition, 96), 100 - plotInset * 2)
  const commit = (field: OscillatorField, value: unknown, label: string) =>
    onChange(path(field), value, `Set oscillator ${number} ${label}`)
  const preview = (field: OscillatorField): Pick<ComponentProps<typeof ParameterSlider>, 'onPreview' | 'onCancel' | 'resetKey'> => ({
    onPreview: (value) => onPreview(path(field), value),
    onCancel: () => onCancelPreview(path(field)),
    resetKey,
  })
  const staticExplanationId = `oscillator-${number}-static-position`

  return (
    <article className={`panel detailed-oscillator-editor${oscillator.enabled ? '' : ' is-disabled'}`} data-testid={`oscillator-${number}-editor`}>
      <header className="detailed-oscillator-header">
        <h2>Oscillator {number}</h2>
        <ToggleControl checked={oscillator.enabled} label={`Oscillator ${number}`} onCommit={(enabled) => commit('enabled', enabled, enabled ? 'on' : 'off')} testId={`oscillator-${number}-enabled`} />
      </header>

      <div className="oscillator-wavetable-row">
        <ParameterSelect id={`oscillator-${number}-wavetable`} label="Wavetable" value={oscillator.wavetableId} options={wavetables.map(({ id, name }) => ({ value: id, label: sourceName(name) }))} onCommit={(value) => commit('wavetableId', value, 'wavetable')} testId={`oscillator-${number}-wavetable`} />
      </div>

      <div className="oscillator-visualization">
        <div className="oscillator-position-control">
          <ParameterSlider id={`oscillator-${number}-position`} label="Position" min={0} max={1} step={0.01} value={canMorph ? oscillator.wavetablePosition : 0.5} disabled={!canMorph} describedBy={!canMorph ? staticExplanationId : undefined} formatValue={canMorph ? percent : () => 'Static'} onCommit={(value) => commit('wavetablePosition', value, 'wavetable position')} orientation="vertical" testId={`oscillator-${number}-position`} {...preview('wavetablePosition')} />
        </div>
        <div className={`wavetable-display detailed-oscillator-waveform view-${effectiveViewMode}`} data-position={displayedPosition.toFixed(4)}>
          <div className="oscillator-waveform-toolbar">
            <strong className="oscillator-position-readout">{canMorph ? percent(displayedPosition) : 'Static'}</strong>
            <small>{canMorph ? `${wavetable.frames.length} morph frames` : 'One frame - position unavailable'}</small>
            <div aria-label={`Oscillator ${number} visualization`} className="oscillator-view-toggle" role="group">
              {(['2d', '3d'] as const).map((mode) => <button aria-pressed={effectiveViewMode === mode} disabled={mode === '3d' && !canMorph} key={mode} onClick={() => setViewMode(mode)} type="button">{mode.toUpperCase()}</button>)}
            </div>
          </div>
          {effectiveViewMode === '2d' ? <svg aria-label={`${sourceName(wavetable.name)} waveform at ${canMorph ? percent(displayedPosition) : 'its single static frame'}`} className="wavetable-plot" data-plot-inset-percent={plotInset} data-testid={`oscillator-${number}-waveform`} preserveAspectRatio="none" role="img" viewBox="0 0 100 52">
            <path className="waveform-line" d={waveformPath} transform={`translate(${plotInset} 0)`} />
          </svg> : <WavetableWaterfall direction="right" number={number} position={displayedPosition} wavetable={wavetable} />}
        </div>
      </div>

      <div className="oscillator-control-rows">
      <fieldset className="oscillator-control-group oscillator-mix-tuning">
        <ParameterSlider id={`oscillator-${number}-level`} label="Level" min={0} max={1} step={0.01} value={oscillator.level} formatValue={percent} onCommit={(value) => commit('level', value, 'level')} resetToMidpointOnDoubleClick testId={`oscillator-${number}-level`} {...preview('level')} />
        <ParameterSlider id={`oscillator-${number}-transpose`} label="Transpose" min={-24} max={24} step={1} value={oscillator.transposeSemitones} formatValue={(value) => `${value > 0 ? '+' : ''}${value}`} onCommit={(value) => commit('transposeSemitones', value, 'transpose')} resetToMidpointOnDoubleClick testId={`oscillator-${number}-transpose`} {...preview('transposeSemitones')} />
        <ParameterSlider id={`oscillator-${number}-fine`} label="Fine" min={-1} max={1} step={0.01} value={fineTuneToControlValue(oscillator.fineTuneCents)} formatValue={formatFineTune} onCommit={(value) => commit('fineTuneCents', fineTuneToCents(value), 'fine tuning')} onPreview={(value) => onPreview(path('fineTuneCents'), fineTuneToCents(value))} onCancel={() => onCancelPreview(path('fineTuneCents'))} resetKey={resetKey} resetToMidpointOnDoubleClick testId={`oscillator-${number}-fine`} />
      </fieldset>

      <fieldset className="oscillator-control-group">
        <ParameterSlider id={`oscillator-${number}-unison`} label="Unison" min={1} max={8} step={1} value={oscillator.unisonVoices} onCommit={(value) => commit('unisonVoices', value, 'unison voices')} resetToMidpointOnDoubleClick testId={`oscillator-${number}-unison`} {...preview('unisonVoices')} />
        <ParameterSlider id={`oscillator-${number}-detune`} label="Detune" min={0} max={1} step={0.01} value={oscillator.unisonDetune} formatValue={percent} onCommit={(value) => commit('unisonDetune', value, 'unison detune')} resetToMidpointOnDoubleClick testId={`oscillator-${number}-detune`} {...preview('unisonDetune')} />
        <ParameterSlider id={`oscillator-${number}-random-phase`} label="Phase" min={0} max={360} step={1} value={phaseToControlValue(oscillator.randomPhase)} formatValue={formatPhase} onCommit={(value) => commit('randomPhase', phaseToParameterValue(value), 'phase')} onPreview={(value) => onPreview(path('randomPhase'), phaseToParameterValue(value))} onCancel={() => onCancelPreview(path('randomPhase'))} resetKey={resetKey} resetToMidpointOnDoubleClick testId={`oscillator-${number}-random-phase`} />
      </fieldset>
      </div>

      <span className="visually-hidden" id={staticExplanationId}>Position is unavailable because this wavetable has one static frame.</span>
    </article>
  )
}
