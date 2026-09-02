import { useId } from 'react'

import type { SupportedPatchPath } from '../patch/paths'
import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../patch/limits'
import type { FilterState, FilterType } from '../patch/types'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE } from './controls/parameterScale'
import { ToggleControl } from './controls/ToggleControl'
import { createFilterResponsePlot } from './visualizations'

interface FilterPanelProps {
  filter: FilterState
  previewFilter: FilterState
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  onPreview: (path: SupportedPatchPath, value: unknown) => void
  onCancelPreview: (path: SupportedPatchPath) => void
}

const FILTER_TYPES: ReadonlyArray<{ value: FilterType; label: string }> = [
  { value: 'lowpass', label: 'Low-pass' },
  { value: 'highpass', label: 'High-pass' },
  { value: 'bandpass', label: 'Band-pass' },
  { value: 'notch', label: 'Notch' },
]

const FILTER_SLOPES = [
  { value: '12', label: '12 dB / octave' },
  { value: '24', label: '24 dB / octave' },
] as const

export function FilterPanel({
  filter,
  previewFilter,
  resetKey,
  onChange,
  onPreview,
  onCancelPreview,
}: FilterPanelProps) {
  const fillGradientId = `filter-fill-${useId().replaceAll(':', '')}`
  const path = (field: keyof FilterState) => `filter.${field}` as SupportedPatchPath
  const commit = (field: keyof FilterState, value: unknown, label: string) => {
    return onChange(path(field), value, `Set filter ${label}`)
  }
  const response = createFilterResponsePlot(previewFilter)
  const modeLabel = FILTER_TYPES.find((option) => option.value === previewFilter.type)?.label ?? 'Filter'

  return (
    <article className={`panel filter-panel effect-editor${filter.enabled ? '' : ' is-disabled'}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Biquad tone stage</p>
          <h2>Filter</h2>
        </div>
        <ToggleControl
          checked={filter.enabled}
          label="Filter"
          onCommit={(enabled) => commit('enabled', enabled, enabled ? 'on' : 'off')}
          testId="filter-enabled"
        />
      </div>

      <figure
        className={filter.enabled ? 'filter-plot' : 'filter-plot filter-plot-disabled'}
        data-filter-mode={previewFilter.type}
        data-testid="filter-plot"
      >
        <svg
          aria-label={`${modeLabel} response at ${previewFilter.cutoffHz.toLocaleString()} hertz with ${Math.round(previewFilter.resonance * 100)} percent resonance${filter.enabled ? '' : ', filter bypassed'}`}
          role="img"
          viewBox="0 0 100 72"
        >
          <defs><linearGradient id={fillGradientId} x1="0" x2="0" y1="0" y2="1"><stop className="plot-area-stop-top" offset="0" /><stop className="plot-area-stop-bottom" offset="1" /></linearGradient></defs>
          <path className="plot-grid" d="M0 18H100M0 36H100M0 54H100M25 0V72M50 0V72M75 0V72" />
          <path aria-hidden="true" className="plot-area" d={`${response.path} L98 72 L2 72 Z`} fill={`url(#${fillGradientId})`} />
          <path
            className="plot-line filter-response-line"
            d={response.path}
            data-testid="filter-response-path"
          />
          <line
            className="filter-cutoff-line"
            data-cutoff-position={response.cutoffPosition}
            data-testid="filter-cutoff-line"
            x1={response.cutoffX}
            x2={response.cutoffX}
            y1="5"
            y2="64"
          />
        </svg>
        <figcaption aria-live="polite">
          <span>20 Hz</span>
          <strong data-testid="filter-cutoff">{previewFilter.cutoffHz.toLocaleString()} Hz</strong>
          <span>20 kHz</span>
        </figcaption>
        <div className="filter-mode-readout">{modeLabel}</div>
      </figure>

      <div className="control-grid filter-controls">
        <ParameterSelect
          id="filter-type"
          label="Mode"
          onCommit={(value) => commit('type', value, 'type')}
          options={FILTER_TYPES}
          testId="filter-type"
          value={filter.type}
        />
        <ParameterSelect
          id="filter-slope"
          label="Slope"
          onCommit={(value) => commit('slope', Number(value), 'slope')}
          options={FILTER_SLOPES}
          testId="filter-slope"
          value={String(filter.slope) as '12' | '24'}
        />
        <ParameterSlider
          formatValue={(value) => `${value.toLocaleString()} Hz`}
          id="filter-cutoff-control"
          label="Cutoff"
          max={FILTER_CUTOFF_MAX_HZ}
          min={FILTER_CUTOFF_MIN_HZ}
          onCancel={() => onCancelPreview(path('cutoffHz'))}
          onCommit={(value) => commit('cutoffHz', value, 'cutoff')}
          onPreview={(value) => onPreview(path('cutoffHz'), value)}
          resetKey={resetKey}
          scale={WHOLE_NUMBER_LOGARITHMIC_PARAMETER_SCALE}
          scaleStep={0.01}
          step={20}
          testId="filter-cutoff-control"
          value={filter.cutoffHz}
        />
        <ParameterSlider
          formatValue={(value) => value.toFixed(2)}
          id="filter-resonance"
          label="Resonance"
          max={1}
          min={0}
          onCancel={() => onCancelPreview(path('resonance'))}
          onCommit={(value) => commit('resonance', value, 'resonance')}
          onPreview={(value) => onPreview(path('resonance'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="filter-resonance"
          value={filter.resonance}
        />
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 100)}%`}
          id="filter-drive"
          label="Drive"
          max={1}
          min={0}
          onCancel={() => onCancelPreview(path('drive'))}
          onCommit={(value) => commit('drive', value, 'drive')}
          onPreview={(value) => onPreview(path('drive'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="filter-drive"
          value={previewFilter.drive}
        />
        <ParameterSlider
          formatValue={(value) => `${Math.round(value * 100)}%`}
          id="filter-keytrack"
          label="Key track"
          max={1}
          min={0}
          onCancel={() => onCancelPreview(path('keytrack'))}
          onCommit={(value) => commit('keytrack', value, 'keytrack')}
          onPreview={(value) => onPreview(path('keytrack'), value)}
          resetKey={resetKey}
          step={0.01}
          testId="filter-keytrack"
          value={previewFilter.keytrack}
        />
      </div>
    </article>
  )
}
