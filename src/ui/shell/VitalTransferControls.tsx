import { useRef, type ChangeEvent, type ComponentProps } from 'react'

import type { VitalFixtureStatus } from '../../app/appStore'
import { PatchHeader } from '../PatchHeader'

interface VitalTransferControlsProps extends ComponentProps<typeof PatchHeader> {
  exportFilename: string
  vitalStatus: VitalFixtureStatus
  onImport: (file: File) => Promise<void>
  onExport: () => void
}

export function VitalTransferControls({ exportFilename, vitalStatus, onImport, onExport, ...preset }: VitalTransferControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void onImport(file)
  }

  return <section aria-label="Preset transfer" className="sidebar-transfer">
    <div className="sidebar-section-heading"><span>Preset</span><strong className="visually-hidden" aria-live="polite" data-testid="vital-transfer-status">Vital transfer {vitalStatus}</strong></div>
    <div className="sidebar-transfer-row sidebar-preset-row">
      <PatchHeader {...preset} />
    </div>
    <div className="sidebar-transfer-row sidebar-transfer-actions">
      <input
        accept=".vital,application/json"
        className="visually-hidden"
        data-testid="import-vital-input"
        onChange={handleFileSelection}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      <button aria-label="Import Vital" className="button button-import" data-testid="import-vital" disabled={vitalStatus !== 'ready'} onClick={() => fileInputRef.current?.click()} type="button">Import</button>
      <button aria-label="Export Vital" className="button button-export" data-testid="export-vital" disabled={vitalStatus !== 'ready'} onClick={onExport} type="button">Export</button>
    </div>
    <span className="visually-hidden" data-testid="export-filename">{exportFilename}</span>
  </section>
}
