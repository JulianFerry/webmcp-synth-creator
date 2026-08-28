import { AuditionPanel } from '../ui/AuditionPanel'
import { EnvelopePanel } from '../ui/EnvelopePanel'
import { EffectsPanel } from '../ui/EffectsPanel'
import { FilterPanel } from '../ui/FilterPanel'
import { LfoPanel } from '../ui/LfoPanel'
import { ModulationPanel } from '../ui/ModulationPanel'
import { OscillatorPanel } from '../ui/OscillatorPanel'
import { PatchHeader } from '../ui/PatchHeader'
import { WorkbenchShell } from '../ui/WorkbenchShell'
import type { AppStore } from './appStore'

interface AppProps {
  store: AppStore
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function App({ store }: AppProps) {
  const {
    patch,
    summary,
    changed,
    canUndo,
    audio,
    webMcpStatus,
    webMcpReason,
    vitalStatus,
    vitalError,
    exportFilename,
    lastError,
    transactionCount,
    historySize,
    controlResetKey,
    applyDarker,
    applyPatchChange,
    previewPatchChange,
    cancelPatchPreview,
    startAudio,
    noteOn,
    noteOff,
    releaseAllNotes,
    toggleHeldNote,
    undo,
    exportVital,
  } = store()

  const changedEntries = Object.entries(changed)
  const wavetables = Object.values(patch.wavetableData)
  const previewPaths = Object.keys(audio.previewValues)

  return (
    <WorkbenchShell>
      <PatchHeader
        canUndo={canUndo}
        exportFilename={exportFilename}
        onExport={exportVital}
        onUndo={undo}
        summary={summary}
        vitalStatus={vitalStatus}
      />

      <section className="signal-strip" aria-label="Adapter and audio status">
        <div className={`status-cell status-${webMcpStatus}`} data-testid="webmcp-status">
          <span>WebMCP</span>
          <strong>{webMcpStatus}</strong>
          <small>{webMcpReason ?? 'get_patch + apply_patch + set_lfo_shape'}</small>
        </div>
        <div
          className={`status-cell status-${audio.lifecycle}`}
          data-active-count={audio.activeVoiceCount}
          data-attack={patch.ampEnvelope.attackSeconds}
          data-cutoff={audio.cutoffHz}
          data-decay={patch.ampEnvelope.decaySeconds}
          data-detune={patch.oscillators[0].unisonDetune}
          data-fine={patch.oscillators[0].fineTuneCents}
          data-glide={patch.voice.glideSeconds}
          data-level={patch.oscillators[0].level}
          data-lfo-enabled={patch.lfo1.enabled}
          data-lfo-points={patch.lfo1.points.length}
          data-lfo-rate={patch.lfo1.rate.mode === 'sync' ? patch.lfo1.rate.division : patch.lfo1.rate.hz}
          data-modulation-version={audio.modulationScheduleVersion}
          data-route-count={patch.modulations.length}
          data-delay-enabled={patch.effects.delay.enabled}
          data-reverb-enabled={patch.effects.reverb.enabled}
          data-resonance={patch.filter.resonance}
          data-sustain={patch.ampEnvelope.sustainLevel}
          data-transpose={patch.oscillators[0].transposeSemitones}
          data-unison={patch.oscillators[0].unisonVoices}
          data-spread={patch.oscillators[0].stereoSpread}
          data-velocity-sensitivity={patch.voice.velocitySensitivity}
          data-effective-attack={audio.effective.ampEnvelope.attackSeconds}
          data-effective-cutoff={audio.effective.filter.cutoffHz}
          data-effective-decay={audio.effective.ampEnvelope.decaySeconds}
          data-effective-detune={audio.effective.oscillators[0].unisonDetune}
          data-effective-fine={audio.effective.oscillators[0].fineTuneCents}
          data-effective-glide={audio.effective.voice.glideSeconds}
          data-effective-level={audio.effective.oscillators[0].level}
          data-effective-position={audio.effective.oscillators[0].wavetablePosition}
          data-effective-release={audio.effective.ampEnvelope.releaseSeconds}
          data-effective-resonance={audio.effective.filter.resonance}
          data-effective-spread={audio.effective.oscillators[0].stereoSpread}
          data-effective-sustain={audio.effective.ampEnvelope.sustainLevel}
          data-effective-transpose={audio.effective.oscillators[0].transposeSemitones}
          data-effective-unison={audio.effective.oscillators[0].unisonVoices}
          data-effective-velocity-sensitivity={audio.effective.voice.velocitySensitivity}
          data-draft-attack={audio.draft.ampEnvelope.attackSeconds}
          data-draft-decay={audio.draft.ampEnvelope.decaySeconds}
          data-draft-release={audio.draft.ampEnvelope.releaseSeconds}
          data-held={audio.held}
          data-position={audio.wavetablePosition}
          data-preview-count={previewPaths.length}
          data-preview-paths={previewPaths.sort().join(',')}
          data-preview-position={audio.previewWavetablePositions[0] ?? ''}
          data-testid="audio-adapter-state"
        >
          <span>Audio engine</span>
          <strong data-testid="audio-lifecycle">{audio.lifecycle}</strong>
          <small>
            {audio.activeVoiceCount} active / {audio.polyphony} max / {audio.stolenVoiceCount} stolen
          </small>
        </div>
        <div className={`status-cell status-${vitalStatus}`} data-testid="vital-status">
          <span>Vital fixture</span>
          <strong>{vitalStatus}</strong>
          <small>{vitalError ?? 'Pinned Init loaded'}</small>
        </div>
      </section>

      <section className="engine-grid" aria-label="Playable browser voice">
        <OscillatorPanel
          index={0}
          onCancelPreview={cancelPatchPreview}
          onChange={applyPatchChange}
          onPreview={previewPatchChange}
          oscillator={patch.oscillators[0]}
          previewPosition={audio.draft.oscillators[0].wavetablePosition}
          resetKey={controlResetKey}
          wavetables={wavetables}
        />
        <OscillatorPanel
          index={1}
          onCancelPreview={cancelPatchPreview}
          onChange={applyPatchChange}
          onPreview={previewPatchChange}
          oscillator={patch.oscillators[1]}
          previewPosition={audio.draft.oscillators[1].wavetablePosition}
          resetKey={controlResetKey}
          wavetables={wavetables}
        />
        <EnvelopePanel
          envelope={patch.ampEnvelope}
          onCancelPreview={cancelPatchPreview}
          onChange={applyPatchChange}
          onPreview={previewPatchChange}
          previewEnvelope={audio.draft.ampEnvelope}
          resetKey={controlResetKey}
        />
        <FilterPanel
          filter={patch.filter}
          onCancelPreview={cancelPatchPreview}
          onChange={applyPatchChange}
          onPreview={previewPatchChange}
          previewFilter={audio.draft.filter}
          resetKey={controlResetKey}
        />
        <AuditionPanel
          audio={audio}
          onCancelPreview={cancelPatchPreview}
          onChange={applyPatchChange}
          onNoteOff={noteOff}
          onNoteOn={noteOn}
          onReleaseAll={releaseAllNotes}
          onStartAudio={startAudio}
          onToggleHeldNote={toggleHeldNote}
          onPreview={previewPatchChange}
          resetKey={controlResetKey}
          voice={patch.voice}
        />
      </section>

      <section className="structured-grid" aria-label="Structured modulation and effects">
        <LfoPanel
          lfo={patch.lfo1}
          onChange={applyPatchChange}
          resetKey={controlResetKey}
        />
        <ModulationPanel
          envelope={patch.modEnvelope}
          modulations={patch.modulations}
          onChange={applyPatchChange}
          resetKey={controlResetKey}
        />
        <EffectsPanel
          effects={patch.effects}
          onChange={applyPatchChange}
          resetKey={controlResetKey}
        />
      </section>

      <section className="state-monitor-grid" aria-label="Committed patch transaction">
        <article className="panel canonical-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Canonical PatchState</p>
              <h2>Committed voice</h2>
            </div>
            <span className="version-chip">v1</span>
          </div>
          <dl className="parameter-grid">
            <div>
              <dt>Osc 1</dt>
              <dd>{summary.oscillators[0].wavetableId}</dd>
            </div>
            <div>
              <dt>Osc 2</dt>
              <dd>{summary.oscillators[1].wavetableId}</dd>
            </div>
            <div>
              <dt>Filter</dt>
              <dd>{summary.filter.cutoffHz.toLocaleString()} Hz</dd>
            </div>
            <div>
              <dt>Polyphony</dt>
              <dd>{summary.voice.polyphony}</dd>
            </div>
            <div>
              <dt>LFO 1</dt>
              <dd>{summary.lfo1.pointCount} pts</dd>
            </div>
            <div>
              <dt>Routes</dt>
              <dd>{summary.modulations.length}</dd>
            </div>
            <div>
              <dt>Transactions</dt>
              <dd data-testid="transaction-count">{transactionCount}</dd>
            </div>
            <div>
              <dt>Undo depth</dt>
              <dd data-testid="history-size">{historySize}</dd>
            </div>
          </dl>
          <button className="darken-control" onClick={applyDarker} type="button">
            <span>One manual command</span>
            <strong>Make darker</strong>
          </button>
        </article>

        <article className="panel panel-diff">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Atomic command result</p>
              <h2>Latest compact diff</h2>
            </div>
            <span className="count-chip">{changedEntries.length} paths</span>
          </div>

          {changedEntries.length === 0 ? (
            <p className="empty-diff">Waiting for one completed UI gesture or WebMCP transaction.</p>
          ) : (
            <ol className="diff-list" data-testid="latest-diff">
              {changedEntries.map(([path, values]) => (
                <li key={path}>
                  <code>{path}</code>
                  <span>{formatValue(values.before)}</span>
                  <b aria-hidden="true">-&gt;</b>
                  <strong>{formatValue(values.after)}</strong>
                </li>
              ))}
            </ol>
          )}
          <footer>
            <span>Undo</span>
            <strong data-testid="undo-available">{canUndo ? 'available' : 'empty'}</strong>
          </footer>
        </article>
      </section>

      {lastError ? (
        <div className="error-banner" role="alert">
          {lastError}
        </div>
      ) : null}
    </WorkbenchShell>
  )
}
