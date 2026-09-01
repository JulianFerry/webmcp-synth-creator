import type { BrowserSynthState } from '../../audio/BrowserSynth'
import type { PatchState, PatchSummary } from '../../patch/types'
import type { VariantId } from '../../session/SessionService'
import type { CapabilityStatus, VitalFixtureStatus } from '../../app/appStore'
import { ChangeSummary } from '../ChangeSummary'
import { WebMcpStatus } from '../WebMcpStatus'

interface DiagnosticDrawerProps {
  applyDarker: () => void
  audio: BrowserSynthState
  canRedo: boolean
  canUndo: boolean
  changed: Record<string, { before: unknown; after: unknown }>
  currentVariant: VariantId
  futureSize: number
  historySize: number
  patch: PatchState
  reason: string | null
  summary: PatchSummary
  transactionCount: number
  vitalError: string | null
  vitalStatus: VitalFixtureStatus
  webMcpReason: string | null
  webMcpStatus: CapabilityStatus
}

export function TelemetryRegion(props: DiagnosticDrawerProps) {
  const { audio, patch } = props
  const previewPaths = Object.keys(audio.previewValues)
  return (
    <div aria-hidden="true" className="visually-hidden" data-testid="telemetry-region">
        <section className="signal-strip" aria-label="Adapter and audio status">
          <WebMcpStatus reason={props.webMcpReason} status={props.webMcpStatus} />
          <div
            className={`status-cell status-${audio.lifecycle}`}
            data-active-count={audio.activeVoiceCount} data-attack={patch.ampEnvelope.attackSeconds}
            data-cutoff={audio.cutoffHz} data-decay={patch.ampEnvelope.decaySeconds}
            data-detune={patch.oscillators[0].unisonDetune} data-fine={patch.oscillators[0].fineTuneCents}
            data-glide={patch.voice.glideSeconds} data-level={patch.oscillators[0].level}
            data-lfo-enabled={patch.lfo1.enabled} data-lfo-points={patch.lfo1.points.length}
            data-lfo-rate={patch.lfo1.rate.mode === 'sync' ? patch.lfo1.rate.division : patch.lfo1.rate.hz}
            data-modulation-version={audio.modulationScheduleVersion} data-route-count={patch.modulations.length}
            data-delay-enabled={patch.effects.delay.enabled} data-reverb-enabled={patch.effects.reverb.enabled}
            data-effects-order={patch.effects.order.join(',')} data-effective-effects-order={audio.effective.effects.order.join(',')}
            data-variant={props.currentVariant} data-resonance={patch.filter.resonance}
            data-sustain={patch.ampEnvelope.sustainLevel} data-transpose={patch.oscillators[0].transposeSemitones}
            data-unison={patch.oscillators[0].unisonVoices} data-spread={patch.oscillators[0].stereoSpread}
            data-velocity-sensitivity={patch.voice.velocitySensitivity}
            data-effective-attack={audio.effective.ampEnvelope.attackSeconds} data-effective-cutoff={audio.effective.filter.cutoffHz}
            data-effective-decay={audio.effective.ampEnvelope.decaySeconds} data-effective-detune={audio.effective.oscillators[0].unisonDetune}
            data-effective-fine={audio.effective.oscillators[0].fineTuneCents} data-effective-glide={audio.effective.voice.glideSeconds}
            data-effective-level={audio.effective.oscillators[0].level} data-effective-position={audio.effective.oscillators[0].wavetablePosition}
            data-effective-release={audio.effective.ampEnvelope.releaseSeconds} data-effective-resonance={audio.effective.filter.resonance}
            data-effective-spread={audio.effective.oscillators[0].stereoSpread} data-effective-sustain={audio.effective.ampEnvelope.sustainLevel}
            data-effective-transpose={audio.effective.oscillators[0].transposeSemitones} data-effective-unison={audio.effective.oscillators[0].unisonVoices}
            data-effective-velocity-sensitivity={audio.effective.voice.velocitySensitivity}
            data-draft-attack={audio.draft.ampEnvelope.attackSeconds} data-draft-decay={audio.draft.ampEnvelope.decaySeconds}
            data-draft-release={audio.draft.ampEnvelope.releaseSeconds} data-held={audio.held}
            data-position={audio.wavetablePosition} data-preview-count={previewPaths.length}
            data-preview-paths={previewPaths.sort().join(',')} data-preview-position={audio.previewWavetablePositions[0] ?? ''}
            data-testid="audio-adapter-state"
          ><span>Audio engine</span><strong data-testid="audio-lifecycle">{audio.lifecycle}</strong><small>{audio.activeVoiceCount} active / {audio.polyphony} max / {audio.stolenVoiceCount} stolen</small></div>
          <div className={`status-cell status-${props.vitalStatus}`} data-testid="vital-status"><span>Vital fixture</span><strong>{props.vitalStatus}</strong><small>{props.vitalError ?? 'Pinned Init loaded'}</small></div>
        </section>
        <section className="state-monitor-grid" aria-label="Committed patch transaction">
          <article className="panel canonical-panel">
            <div className="panel-heading"><div><p className="eyebrow">Canonical PatchState</p><h2>Committed voice</h2></div><span className="version-chip">v2</span></div>
            <dl className="parameter-grid">
              {props.summary.oscillators.map((oscillator, index) => <div key={index}><dt>Osc {index + 1}</dt><dd>{oscillator.wavetableId}</dd></div>)}
              <div><dt>Filter</dt><dd>{props.summary.filter.cutoffHz.toLocaleString()} Hz</dd></div>
              <div><dt>Polyphony</dt><dd>{props.summary.voice.polyphony}</dd></div>
              <div><dt>LFO</dt><dd>{props.summary.lfo1.pointCount} pts</dd></div>
              <div><dt>Routes</dt><dd>{props.summary.modulations.length}</dd></div>
              <div><dt>Variant</dt><dd data-testid="current-variant">{props.currentVariant}</dd></div>
              <div><dt>Transactions</dt><dd data-testid="transaction-count">{props.transactionCount}</dd></div>
              <div><dt>Undo depth</dt><dd data-testid="history-size">{props.historySize}</dd></div>
              <div><dt>Redo depth</dt><dd data-testid="future-size">{props.futureSize}</dd></div>
            </dl>
            <button className="darken-control" onClick={props.applyDarker} type="button"><span>One manual command</span><strong>Make darker</strong></button>
          </article>
          <ChangeSummary canRedo={props.canRedo} canUndo={props.canUndo} changed={props.changed} reason={props.reason} />
        </section>
    </div>
  )
}
