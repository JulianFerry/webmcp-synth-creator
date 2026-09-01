import type { VoiceState } from '../../patch/types'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

export function VoiceEditor({ voice, resetKey, onChange }: { voice: VoiceState; resetKey: number; onChange: (field: keyof VoiceState, value: unknown) => boolean }) {
  return <article className="panel voice-editor"><div className="panel-heading"><div><p className="eyebrow">Note allocation</p><h2>Voice behavior</h2></div><ToggleControl checked={voice.legato} label="Legato" onCommit={(v) => onChange('legato', v)} testId="voice-legato" /></div><div className="control-grid effect-controls">
    <ParameterSlider formatValue={(v) => `${v} voices`} id="voice-polyphony" label="Polyphony" max={16} min={1} onCommit={(v) => onChange('polyphony', v)} resetKey={resetKey} step={1} testId="voice-polyphony" value={voice.polyphony} />
    <ParameterSlider formatValue={(v) => `${Math.round(v * 1000)} ms`} id="voice-glide" label="Glide" max={1} min={0} onCommit={(v) => onChange('glideSeconds', v)} resetKey={resetKey} step={.01} testId="voice-glide" value={voice.glideSeconds} />
    <ParameterSlider formatValue={(v) => `${Math.round(v * 100)}%`} id="voice-velocity" label="Velocity sensitivity" max={1} min={0} onCommit={(v) => onChange('velocitySensitivity', v)} resetKey={resetKey} step={.01} testId="voice-velocity-sensitivity" value={voice.velocitySensitivity} />
  </div></article>
}
