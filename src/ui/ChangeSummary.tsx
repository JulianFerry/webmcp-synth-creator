interface ChangeSummaryProps {
  changed: Record<string, { before: unknown; after: unknown }>
  reason: string | null
  canUndo: boolean
  canRedo: boolean
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function ChangeSummary({ changed, reason, canUndo, canRedo }: ChangeSummaryProps) {
  const entries = Object.entries(changed)

  return (
    <article className="panel panel-diff">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Atomic command result</p>
          <h2>Latest compact diff</h2>
        </div>
        <span className="count-chip">{entries.length} paths</span>
      </div>

      {reason ? <p className="transaction-reason">{reason}</p> : null}
      {entries.length === 0 ? (
        <p className="empty-diff">Waiting for one completed UI gesture or WebMCP transaction.</p>
      ) : (
        <ol className="diff-list" data-testid="latest-diff">
          {entries.map(([path, values]) => (
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
        <span>Undo / redo</span>
        <strong data-testid="undo-available">{canUndo ? 'available' : 'empty'}</strong>
        <strong data-testid="redo-available">{canRedo ? 'available' : 'empty'}</strong>
      </footer>
    </article>
  )
}
