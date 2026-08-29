import type { ComponentProps } from 'react'
import type { SupportedPatchPath } from '../../patch/paths'
import type { FilterState, OscillatorState, PatchState, WavetableState } from '../../patch/types'
import { wavetableSupportsMorphing } from '../../wavetables/render'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { EffectsChainStrip } from './EffectsChainStrip'
import { WavetableWaterfall } from './WavetableWaterfall'

export interface OscillatorOverviewCardProps {
  index: 0 | 1 | 2; oscillator: OscillatorState; previewPosition: number; resetKey: number
  wavetables: WavetableState[]; effects: PatchState['effects']; filter: FilterState
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

export function OscillatorOverviewCard(props: OscillatorOverviewCardProps) {
  const { index, oscillator, previewPosition, resetKey, wavetables, effects, filter, onChange, onPreview, onCancelPreview } = props
  const number = index + 1
  const table = wavetables.find((candidate) => candidate.id === oscillator.wavetableId) as WavetableState
  const canMorph = wavetableSupportsMorphing(table)
  const position = canMorph ? previewPosition : 0
  const path = (field: 'wavetableId' | 'wavetablePosition' | 'level') => `oscillators.${index}.${field}` as SupportedPatchPath
  const preview = (field: 'wavetablePosition' | 'level'): Pick<ComponentProps<typeof ParameterSlider>, 'onPreview' | 'onCancel' | 'resetKey'> => ({
    onPreview: (value) => onPreview(path(field), value), onCancel: () => onCancelPreview(path(field)), resetKey,
  })
  const explanationId = `oscillator-${number}-static-explanation`
  return <article className="panel oscillator-overview-card" data-testid={`oscillator-${number}-overview-card`}>
    <header><p className="eyebrow">Source {String(number).padStart(2, '0')}</p><h2>Oscillator {number}</h2></header>
    <ParameterSelect id={`overview-oscillator-${number}-wavetable`} label="Source" value={oscillator.wavetableId} options={wavetables.map(({ id, name }) => ({ value: id, label: name.replace('Generated ', '') }))} onCommit={(value) => onChange(path('wavetableId'), value, `Set oscillator ${number} wavetable`)} testId={`overview-oscillator-${number}-wavetable`} />
    <div className="oscillator-overview-body">
      <ParameterSlider id={`overview-oscillator-${number}-position`} label="Position" value={oscillator.wavetablePosition} min={0} max={1} step={0.01} orientation="vertical" disabled={!canMorph} describedBy={!canMorph ? explanationId : undefined} formatValue={canMorph ? (value) => `${Math.round(value * 100)}%` : () => 'Static'} onCommit={(value) => onChange(path('wavetablePosition'), value, `Set oscillator ${number} position`)} testId={`overview-oscillator-${number}-position`} {...preview('wavetablePosition')} />
      <WavetableWaterfall number={number} position={position} wavetable={table} />
      <EffectsChainStrip effects={effects} filter={filter} />
    </div>
    <span className="visually-hidden" id={explanationId}>{canMorph ? '' : 'Position is unavailable because this wavetable has one static frame.'}</span>
    <ParameterSlider id={`overview-oscillator-${number}-level`} label="Level" value={oscillator.level} min={0} max={1} step={0.01} formatValue={(value) => `${Math.round(value * 100)}%`} onCommit={(value) => onChange(path('level'), value, `Set oscillator ${number} level`)} testId={`overview-oscillator-${number}-level`} {...preview('level')} />
  </article>
}
