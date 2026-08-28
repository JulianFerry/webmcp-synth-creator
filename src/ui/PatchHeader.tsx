import type { PatchSummary } from '../patch/types'
import type { VitalFixtureStatus } from '../app/appStore'

interface PatchHeaderProps {
  summary: PatchSummary
  vitalStatus: VitalFixtureStatus
  exportFilename: string
  onExport: () => void
}

export function PatchHeader({
  summary,
  vitalStatus,
  exportFilename,
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
