import type { PatchSummary } from '../patch/types'
import type { CuratedPresetSummary } from '../presets/registry'

interface PatchHeaderProps {
  summary: PatchSummary
  presets: CuratedPresetSummary[]
  currentPresetId: string | null
  onLoadPreset: (presetId: string) => void
}

export function PatchHeader({
  summary,
  presets,
  currentPresetId,
  onLoadPreset,
}: PatchHeaderProps) {
  const musicalPresets = presets.filter(({ tags }) => !tags.includes('calibration'))
  const calibrationPresets = presets.filter(({ tags }) => tags.includes('calibration'))

  return (
    <div className="patch-actions" data-patch-name={summary.name}>
      <label className="header-preset-control" htmlFor="curated-patch-select">
        <span>Preset</span>
        <select
          aria-label="Preset"
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
          <optgroup label="Curated patches">
            {musicalPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Calibration ladder">
            {calibrationPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
    </div>
  )
}
