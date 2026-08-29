import type { ReverbState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

export function ReverbEditor({ reverb, resetKey, onChange }: { reverb: ReverbState; resetKey: number; onChange: (field: keyof ReverbState, value: unknown) => boolean }) {
  return <article className="panel effect-editor"><div className="panel-heading"><div><p className="eyebrow">Spatial tail</p><h2>Reverb</h2></div><ToggleControl checked={reverb.enabled} label="Reverb" onCommit={(v) => onChange('enabled', v)} testId="reverb-enabled" /></div><div className="control-grid effect-controls">
    <ParameterSlider formatValue={(v) => `${Math.round(v * 100)}%`} id="reverb-mix" label="Wet send" max={1} min={0} onCommit={(v) => onChange('mix', v)} resetKey={resetKey} step={.01} testId="reverb-mix" value={reverb.mix} />
    <ParameterSlider formatValue={(v) => `${v.toFixed(1)} s`} id="reverb-decay" label="Decay" max={8} min={.1} onCommit={(v) => onChange('decaySeconds', v)} resetKey={resetKey} step={.1} testId="reverb-decay" value={reverb.decaySeconds} />
    <ParameterSlider formatValue={(v) => `${Math.round(v * 100)}%`} id="reverb-size" label="Size" max={1} min={0} onCommit={(v) => onChange('size', v)} resetKey={resetKey} step={.01} testId="reverb-size" value={reverb.size} />
  </div></article>
}
