import type { PatchSummary } from '../patch/types'
import type { VitalFixtureStatus } from '../app/appStore'

interface PatchHeaderProps {
  summary: PatchSummary
  canUndo: boolean
  vitalStatus: VitalFixtureStatus
  exportFilename: string
  onUndo: () => void
  onExport: () => void
}

export function PatchHeader({
  summary,
  canUndo,
  vitalStatus,
  exportFilename,
  onUndo,
  onExport,
}: PatchHeaderProps) {
  return (
    <header className="masthead">
      <div className="patch-title-block">
        <p className="eyebrow">Wavetable Workbench / Voice Engine 02</p>
        <h1>{summary.name}</h1>
        <p className="patch-description">{summary.description}</p>
      </div>
      <div className="masthead-actions">
        <button className="button button-quiet" disabled={!canUndo} onClick={onUndo} type="button">
          Undo transaction
        </button>
        <button
          className="button button-export"
          data-testid="export-vital"
          disabled={vitalStatus !== 'ready'}
          onClick={onExport}
          type="button"
        >
          Export .vital
        </button>
        <code data-testid="export-filename">{exportFilename}</code>
      </div>
    </header>
  )
}
