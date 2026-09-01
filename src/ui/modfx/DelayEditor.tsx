import { TEMPO_SYNC_DIVISIONS } from '../../patch/limits'
import type { DelayState } from '../../patch/types'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

export function DelayEditor({ delay, resetKey, onChange }: { delay: DelayState; resetKey: number; onChange: (field: keyof DelayState, value: unknown) => boolean }) {
  return <article className={`panel effect-editor${delay.enabled ? '' : ' is-disabled'}`}><div className="panel-heading"><div><p className="eyebrow">Time-domain echo</p><h2>Delay</h2></div><ToggleControl checked={delay.enabled} label="Delay" onCommit={(value) => onChange('enabled', value)} testId="delay-enabled" /></div><div className="control-grid effect-controls">
    <ParameterSelect id="delay-mode" label="Mode" onCommit={(value) => onChange('mode', value)} options={[{ value: 'sync', label: 'Tempo sync' }, { value: 'free', label: 'Free time' }]} testId="delay-mode" value={delay.mode} />
    {delay.mode === 'sync' ? <ParameterSelect id="delay-division" label="Division" onCommit={(value) => onChange('division', value)} options={TEMPO_SYNC_DIVISIONS.map((value) => ({ value, label: value.endsWith('T') ? `${value.slice(0, -1)} triplet` : value }))} testId="delay-division" value={delay.division ?? '1/8'} /> : <ParameterSlider formatValue={(v) => `${Math.round(v * 1000)} ms`} id="delay-time" label="Time" max={2} min={.01} onCommit={(v) => onChange('timeSeconds', v)} resetKey={resetKey} step={.01} testId="delay-time" value={delay.timeSeconds ?? .25} />}
    <ParameterSlider formatValue={(v) => `${Math.round(v * 100)}%`} id="delay-feedback" label="Feedback" max={.9} min={0} onCommit={(v) => onChange('feedback', v)} resetKey={resetKey} step={.01} testId="delay-feedback" value={delay.feedback} />
    <ParameterSlider formatValue={(v) => `${Math.round(v * 100)}%`} id="delay-mix" label="Mix" max={1} min={0} onCommit={(v) => onChange('mix', v)} resetKey={resetKey} step={.01} testId="delay-mix" value={delay.mix} />
  </div></article>
}
