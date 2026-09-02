import type { CompressorState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

interface Props {
  compressor: CompressorState
  resetKey: number
  onChange: (field: keyof CompressorState, value: unknown) => boolean
}

const BANDS: CompressorState['bands'][] = ['multiband', 'low', 'high']

export function CompressorEditor({ compressor, resetKey, onChange }: Props) {
  return <article className={`panel effect-editor compressor-editor${compressor.enabled ? '' : ' is-disabled'}`}>
    <div className="panel-heading"><div><p className="eyebrow">Dynamic contour</p><h2>Compressor</h2></div><ToggleControl checked={compressor.enabled} label="Compressor" onCommit={(value) => onChange('enabled', value)} testId="compressor-enabled" /></div>
    <div className="segmented-control" role="group" aria-label="Compressor bands">
      {BANDS.map((bands) => <button aria-pressed={compressor.bands === bands} key={bands} onClick={() => onChange('bands', bands)} type="button">{bands === 'multiband' ? 'Multi' : bands}</button>)}
    </div>
    <div className="control-grid effect-controls compressor-controls">
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-amount" label="Amount" max={1} min={0} onCommit={(value) => onChange('amount', value)} resetKey={resetKey} step={.01} testId="compressor-amount" value={compressor.amount} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-attack" label="Attack" max={1} min={0} onCommit={(value) => onChange('attack', value)} resetKey={resetKey} step={.01} testId="compressor-attack" value={compressor.attack} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-release" label="Release" max={1} min={0} onCommit={(value) => onChange('release', value)} resetKey={resetKey} step={.01} testId="compressor-release" value={compressor.release} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-mix" label="Mix" max={1} min={0} onCommit={(value) => onChange('mix', value)} resetKey={resetKey} step={.01} testId="compressor-mix" value={compressor.mix} />
    </div>
  </article>
}
