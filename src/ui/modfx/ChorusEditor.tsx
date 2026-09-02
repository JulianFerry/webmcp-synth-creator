import type { ChorusState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

interface Props {
  chorus: ChorusState
  resetKey: number
  onChange: (field: keyof ChorusState, value: unknown) => boolean
}

export function ChorusEditor({ chorus, resetKey, onChange }: Props) {
  return <article className={`panel effect-editor chorus-editor${chorus.enabled ? '' : ' is-disabled'}`}>
    <div className="panel-heading"><div><p className="eyebrow">Stereo ensemble</p><h2>Chorus</h2></div><ToggleControl checked={chorus.enabled} label="Chorus" onCommit={(value) => onChange('enabled', value)} testId="chorus-enabled" /></div>
    <div className="chorus-orbit" aria-hidden="true">{Array.from({ length: chorus.voices }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 360 / chorus.voices}deg) translateX(${13 + chorus.depth * 12}px)` }} />)}<span /></div>
    <div className="control-grid effect-controls chorus-controls">
      <ParameterSlider formatValue={(value) => String(Math.round(value))} id="chorus-voices" label="Voices" max={4} min={1} onCommit={(value) => onChange('voices', value)} resetKey={resetKey} step={1} testId="chorus-voices" value={chorus.voices} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="chorus-rate" label="Rate" max={1} min={0} onCommit={(value) => onChange('rate', value)} resetKey={resetKey} step={.01} testId="chorus-rate" value={chorus.rate} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="chorus-depth" label="Depth" max={1} min={0} onCommit={(value) => onChange('depth', value)} resetKey={resetKey} step={.01} testId="chorus-depth" value={chorus.depth} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="chorus-feedback" label="Feedback" max={1} min={0} onCommit={(value) => onChange('feedback', value)} resetKey={resetKey} step={.01} testId="chorus-feedback" value={chorus.feedback} />
      <ParameterSlider formatValue={(value) => `${Math.round(value * 100)}%`} id="chorus-mix" label="Mix" max={1} min={0} onCommit={(value) => onChange('mix', value)} resetKey={resetKey} step={.01} testId="chorus-mix" value={chorus.mix} />
    </div>
  </article>
}
