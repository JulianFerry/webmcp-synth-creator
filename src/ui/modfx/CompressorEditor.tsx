import type { CompressorState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'
import { CompressorVisual } from './effectVisualizations'

interface Props {
  compressor: CompressorState
  resetKey: number
  onChange: (field: keyof CompressorState, value: unknown) => boolean
}

export function CompressorEditor({ compressor, resetKey, onChange }: Props) {
  return <article className={`panel effect-editor compressor-editor${compressor.enabled ? '' : ' is-disabled'}`}>
    <div className="panel-heading"><h2>Compressor</h2><ToggleControl checked={compressor.enabled} label="Compressor" onCommit={(value) => onChange('enabled', value)} testId="compressor-enabled" /></div>
    <CompressorVisual compressor={compressor} onBandChange={(bands) => onChange('bands', bands)} />
    <div className="control-grid effect-controls compressor-controls">
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-amount" label="Amount" max={1} min={0} onCommit={(value) => onChange('amount', value)} resetKey={resetKey} step={.01} testId="compressor-amount" value={compressor.amount} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-attack" label="Attack" max={1} min={0} onCommit={(value) => onChange('attack', value)} resetKey={resetKey} step={.01} testId="compressor-attack" value={compressor.attack} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-release" label="Release" max={1} min={0} onCommit={(value) => onChange('release', value)} resetKey={resetKey} step={.01} testId="compressor-release" value={compressor.release} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="compressor-mix" label="Mix" max={1} min={0} onCommit={(value) => onChange('mix', value)} resetKey={resetKey} step={.01} testId="compressor-mix" value={compressor.mix} />
    </div>
  </article>
}
