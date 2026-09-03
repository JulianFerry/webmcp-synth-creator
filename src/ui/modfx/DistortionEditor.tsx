import type { DistortionState, DistortionType } from '../../patch/types'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'
import { DistortionVisual } from './effectVisualizations'

const TYPES: ReadonlyArray<{ value: DistortionType; label: string }> = [
  { value: 'soft_clip', label: 'Soft clip' },
  { value: 'hard_clip', label: 'Hard clip' },
  { value: 'sine_fold', label: 'Sine fold' },
  { value: 'bit_crush', label: 'Bit crush' },
]

interface Props {
  distortion: DistortionState
  resetKey: number
  onChange: (field: keyof DistortionState, value: unknown) => boolean
}

export function DistortionEditor({ distortion, resetKey, onChange }: Props) {
  return <article className={`panel effect-editor distortion-editor${distortion.enabled ? '' : ' is-disabled'}`}>
    <div className="panel-heading"><h2>Distortion</h2><ToggleControl checked={distortion.enabled} label="Distortion" onCommit={(value) => onChange('enabled', value)} testId="distortion-enabled" /></div>
    <DistortionVisual distortion={distortion} />
    <div className="control-grid effect-controls">
      <ParameterSelect id="distortion-type" label="Character" onCommit={(value) => onChange('type', value)} options={TYPES} testId="distortion-type" value={distortion.type} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="distortion-drive" label="Drive" max={1} min={0} onCommit={(value) => onChange('drive', value)} resetKey={resetKey} step={.01} testId="distortion-drive" value={distortion.drive} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="distortion-mix" label="Mix" max={1} min={0} onCommit={(value) => onChange('mix', value)} resetKey={resetKey} step={.01} testId="distortion-mix" value={distortion.mix} />
    </div>
  </article>
}
