import { useRef, type ChangeEvent } from 'react'

import type { PatchSummary } from '../patch/types'
import type { VitalFixtureStatus } from '../app/appStore'
import type { CuratedPresetSummary } from '../presets/registry'

interface PatchHeaderProps {
  summary: PatchSummary
  presets: CuratedPresetSummary[]
  currentPresetId: string | null
  vitalStatus: VitalFixtureStatus
  exportFilename: string
  onLoadPreset: (presetId: string) => void
  onImport: (file: File) => Promise<void>
  onExport: () => void
}

export function PatchHeader({
  summary,
  presets,
  currentPresetId,
  vitalStatus,
  exportFilename,
  onLoadPreset,
  onImport,
  onExport,
}: PatchHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void onImport(file)
  }

  return (
    <header className="masthead">
      <div className="patch-title-block">
        <p className="eyebrow">Wavetable Workbench / Voice Engine 02</p>
        <h1>{summary.name}</h1>
        <p className="patch-description">{summary.description}</p>
      </div>
      <div className="masthead-actions">
        <label className="header-preset-control" htmlFor="curated-patch-select">
          <span>Curated patch</span>
          <select
            aria-describedby="vital-compatibility-hint"
            data-testid="preset-selector"
            id="curated-patch-select"
            onChange={(event) => {
              if (event.currentTarget.value) onLoadPreset(event.currentTarget.value)
            }}
            value={currentPresetId ?? ''}
          >
            <option disabled value="">
              Custom / edited patch
            </option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <input
          accept=".vital,application/json"
          className="visually-hidden"
          data-testid="import-vital-input"
          onChange={handleFileSelection}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <button
          aria-describedby="vital-compatibility-hint"
          className="button button-import"
          data-testid="import-vital"
          disabled={vitalStatus !== 'ready'}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          Import Vital
        </button>
        <button
          className="button button-export"
          data-testid="export-vital"
          disabled={vitalStatus !== 'ready'}
          onClick={onExport}
          type="button"
        >
          Export Vital
        </button>
        <code data-testid="export-filename" title={exportFilename}>
          {exportFilename}
        </code>
        <span className="visually-hidden" id="vital-compatibility-hint">
          Import accepts the supported Vital 1.0.7 subset. Loading a patch replaces only the
          selected A or B variant and can be undone.
        </span>
      </div>
    </header>
  )
}
