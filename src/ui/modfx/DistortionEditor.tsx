import type { DistortionState, DistortionType } from '../../patch/types'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

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
    <div className="panel-heading"><div><p className="eyebrow">Harmonic shaper</p><h2>Distortion</h2></div><ToggleControl checked={distortion.enabled} label="Distortion" onCommit={(value) => onChange('enabled', value)} testId="distortion-enabled" /></div>
    <div className="processor-meter distortion-meter" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--meter-level': Math.min(1, distortion.drive * 1.25 + index * .025) } as CSSProperties} />)}</div>
    <div className="control-grid effect-controls">
      <ParameterSelect id="distortion-type" label="Character" onCommit={(value) => onChange('type', value)} options={TYPES} testId="distortion-type" value={distortion.type} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="distortion-drive" label="Drive" max={1} min={0} onCommit={(value) => onChange('drive', value)} resetKey={resetKey} step={.01} testId="distortion-drive" value={distortion.drive} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="distortion-mix" label="Mix" max={1} min={0} onCommit={(value) => onChange('mix', value)} resetKey={resetKey} step={.01} testId="distortion-mix" value={distortion.mix} />
    </div>
  </article>
}
import type { CSSProperties } from 'react'
