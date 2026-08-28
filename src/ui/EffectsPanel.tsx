import type { SupportedPatchPath } from '../patch/paths'
import { TEMPO_SYNC_DIVISIONS } from '../patch/limits'
import type { DelayState, PatchState, ReverbState } from '../patch/types'
import { ParameterSelect } from './controls/ParameterSelect'
import { ParameterSlider } from './controls/ParameterSlider'
import { ToggleControl } from './controls/ToggleControl'

interface EffectsPanelProps {
  effects: PatchState['effects']
  resetKey: number
  onChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
}

const DELAY_DIVISIONS = TEMPO_SYNC_DIVISIONS.map((value) => ({
  value,
  label: value.endsWith('T') ? `${value.slice(0, -1)} triplet` : value,
}))

function seconds(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`
}

export function EffectsPanel({ effects, resetKey, onChange }: EffectsPanelProps) {
  const delayPath = (field: keyof DelayState) => `effects.delay.${field}` as SupportedPatchPath
  const reverbPath = (field: keyof ReverbState) => `effects.reverb.${field}` as SupportedPatchPath
  const commitDelay = (field: keyof DelayState, value: unknown) =>
    onChange(delayPath(field), value, `Set delay ${field}`)
  const commitReverb = (field: keyof ReverbState, value: unknown) =>
    onChange(reverbPath(field), value, `Set reverb ${field}`)

  return (
    <article className="panel effects-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Post-voice ambience</p>
          <h2>Delay + reverb</h2>
        </div>
        <span className="version-chip">FX bus</span>
      </div>

      <div className="effects-columns">
        <section aria-label="Delay controls" className="effect-block">
          <header>
            <h3>Delay</h3>
            <ToggleControl
              checked={effects.delay.enabled}
              label="Delay"
              onCommit={(enabled) => commitDelay('enabled', enabled)}
              testId="delay-enabled"
            />
          </header>
          <div className="control-grid effect-controls">
            <ParameterSelect
              id="delay-mode"
              label="Mode"
              onCommit={(mode) => commitDelay('mode', mode)}
              options={[
                { value: 'sync', label: 'Tempo sync' },
                { value: 'free', label: 'Free time' },
              ]}
              testId="delay-mode"
              value={effects.delay.mode}
            />
            {effects.delay.mode === 'sync' ? (
              <ParameterSelect
                id="delay-division"
                label="Division"
                onCommit={(division) => commitDelay('division', division)}
                options={DELAY_DIVISIONS}
                testId="delay-division"
                value={effects.delay.division ?? '1/8'}
              />
            ) : (
              <ParameterSlider
                formatValue={seconds}
                id="delay-time"
                label="Time"
                max={2}
                min={0.01}
                onCommit={(value) => commitDelay('timeSeconds', value)}
                resetKey={resetKey}
                step={0.01}
                testId="delay-time"
                value={effects.delay.timeSeconds ?? 0.25}
              />
            )}
            <ParameterSlider
              formatValue={(value) => `${Math.round(value * 100)}%`}
              id="delay-feedback"
              label="Feedback"
              max={0.9}
              min={0}
              onCommit={(value) => commitDelay('feedback', value)}
              resetKey={resetKey}
              step={0.01}
              testId="delay-feedback"
              value={effects.delay.feedback}
            />
            <ParameterSlider
              formatValue={(value) => `${Math.round(value * 100)}%`}
              id="delay-mix"
              label="Wet / dry mix"
              max={1}
              min={0}
              onCommit={(value) => commitDelay('mix', value)}
              resetKey={resetKey}
              step={0.01}
              testId="delay-mix"
              value={effects.delay.mix}
            />
          </div>
        </section>

        <section aria-label="Reverb controls" className="effect-block">
          <header>
            <h3>Reverb</h3>
            <ToggleControl
              checked={effects.reverb.enabled}
              label="Reverb"
              onCommit={(enabled) => commitReverb('enabled', enabled)}
              testId="reverb-enabled"
            />
          </header>
          <div className="control-grid effect-controls">
            <ParameterSlider
              formatValue={(value) => `${Math.round(value * 100)}%`}
              id="reverb-mix"
              label="Wet send"
              max={1}
              min={0}
              onCommit={(value) => commitReverb('mix', value)}
              resetKey={resetKey}
              step={0.01}
              testId="reverb-mix"
              value={effects.reverb.mix}
            />
            <ParameterSlider
              formatValue={seconds}
              id="reverb-decay"
              label="Decay"
              max={8}
              min={0.1}
              onCommit={(value) => commitReverb('decaySeconds', value)}
              resetKey={resetKey}
              step={0.1}
              testId="reverb-decay"
              value={effects.reverb.decaySeconds}
            />
            <ParameterSlider
              formatValue={(value) => `${Math.round(value * 100)}%`}
              id="reverb-size"
              label="Size"
              max={1}
              min={0}
              onCommit={(value) => commitReverb('size', value)}
              resetKey={resetKey}
              step={0.01}
              testId="reverb-size"
              value={effects.reverb.size}
            />
          </div>
        </section>
      </div>
    </article>
  )
}
