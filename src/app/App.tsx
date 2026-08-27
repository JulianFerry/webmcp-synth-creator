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
    applyDarker,
    toggleHeldNote,
    undo,
    exportVital,
  } = store()

  const changedEntries = Object.entries(changed)
  const firstOscillator = summary.oscillators[0]

  return (
    <main className="workbench-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Wavetable Workbench / Transaction 01</p>
          <h1>{summary.name}</h1>
          <p className="patch-description">{summary.description}</p>
        </div>
        <div className="masthead-actions">
          <button className="button button-quiet" disabled={!canUndo} onClick={undo} type="button">
            Undo transaction
          </button>
          <button
            className="button button-export"
            data-testid="export-vital"
            disabled={vitalStatus !== 'ready'}
            onClick={exportVital}
            type="button"
          >
            Export .vital
          </button>
          <code data-testid="export-filename">{exportFilename}</code>
        </div>
      </header>

      <section className="signal-strip" aria-label="Adapter status">
        <div className={`status-cell status-${webMcpStatus}`} data-testid="webmcp-status">
          <span>WebMCP</span>
          <strong>{webMcpStatus}</strong>
          <small>{webMcpReason ?? 'get_patch + apply_patch'}</small>
        </div>
        <div className={`status-cell status-${audio.lifecycle}`}>
          <span>Audio graph</span>
          <strong>{audio.held ? 'holding C4' : audio.lifecycle}</strong>
          <small>{audio.reflectedPatchName}</small>
        </div>
        <div className={`status-cell status-${vitalStatus}`} data-testid="vital-status">
          <span>Vital fixture</span>
          <strong>{vitalStatus}</strong>
          <small>{vitalError ?? 'Pinned Init loaded'}</small>
        </div>
      </section>

      <section className="workbench-grid">
        <article className="panel panel-scope">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Canonical PatchState</p>
              <h2>Visible state</h2>
            </div>
            <span className="version-chip">v1</span>
          </div>

          <div className="scope-visual" aria-hidden="true">
            {Array.from({ length: 26 }, (_, index) => (
              <i key={index} style={{ height: `${18 + ((index * 17) % 64)}%` }} />
            ))}
          </div>

          <dl className="parameter-grid">
            <div>
              <dt>Oscillator</dt>
              <dd>{firstOscillator.wavetableId}</dd>
            </div>
            <div>
              <dt>WT position</dt>
              <dd>{firstOscillator.wavetablePosition.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Filter</dt>
              <dd data-testid="filter-cutoff">{summary.filter.cutoffHz.toLocaleString()} Hz</dd>
            </div>
            <div>
              <dt>Resonance</dt>
              <dd>{summary.filter.resonance.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Attack</dt>
              <dd>{summary.ampEnvelope.attackSeconds.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Release</dt>
              <dd>{summary.ampEnvelope.releaseSeconds.toFixed(2)} s</dd>
            </div>
          </dl>
        </article>

        <article className="panel panel-audition">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Committed-state monitor</p>
              <h2>Audition path</h2>
            </div>
            <span className={audio.held ? 'live-indicator active' : 'live-indicator'}>
              {audio.held ? 'live' : 'idle'}
            </span>
          </div>

          <div
            className="adapter-readout"
            data-cutoff={audio.cutoffHz}
            data-held={audio.held}
            data-position={audio.wavetablePosition}
            data-testid="audio-adapter-state"
          >
            <span>Audio adapter reflection</span>
            <strong>{audio.cutoffHz.toLocaleString()} Hz</strong>
            <small>
              position {audio.wavetablePosition.toFixed(2)} / correlation{' '}
              {audio.lastCorrelationId?.slice(0, 8) ?? 'waiting'}
            </small>
          </div>

          <div className="audition-controls">
            <button
              className={audio.held ? 'hold-control active' : 'hold-control'}
              data-testid="hold-note"
              onClick={() => void toggleHeldNote()}
              type="button"
            >
              <span>{audio.held ? 'Release' : 'Hold'}</span>
              <strong>C4</strong>
            </button>
            <button className="darken-control" onClick={applyDarker} type="button">
              <span>Manual command</span>
              <strong>Make darker</strong>
            </button>
          </div>

          <p className="gesture-note">
            Audio begins only after this control receives a user gesture. Every later transaction updates
            the held voice in place.
          </p>
        </article>

        <article className="panel panel-diff">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Atomic result</p>
              <h2>Latest compact diff</h2>
            </div>
            <span className="count-chip">{changedEntries.length} paths</span>
          </div>

          {changedEntries.length === 0 ? (
            <p className="empty-diff">Waiting for one coherent UI or WebMCP transaction.</p>
          ) : (
            <ol className="diff-list" data-testid="latest-diff">
              {changedEntries.map(([path, values]) => (
                <li key={path}>
                  <code>{path}</code>
                  <span>{formatValue(values.before)}</span>
                  <b aria-hidden="true">→</b>
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
    </main>
  )
}
