import type { RequestSource } from '../../dev/latencyTrace'
import { WORKBENCH_TABS, tabForPatchPath, type WorkbenchTab } from '../../app/uiState'

interface LastChangeIndicatorProps {
  changedPaths: string[]
  reason: string | null
  source: RequestSource | null
  onJump: (tab: WorkbenchTab) => void
}

export function LastChangeIndicator({ changedPaths, reason, source, onJump }: LastChangeIndicatorProps) {
  if (!reason) return <p className="last-change last-change-empty">No patch changes in this session</p>
  const destination = tabForPatchPath(changedPaths[0] ?? '')
  const label = WORKBENCH_TABS.find((tab) => tab.id === destination)?.label ?? 'Overview'
  const actor = source === 'webmcp' ? 'LLM' : source === 'history' ? 'History' : 'You'
  return (
    <div className="last-change" data-source={source ?? ''} data-testid="last-change-indicator">
      <span>{actor} changed</span>
      <strong>{reason}</strong>
      <button onClick={() => onJump(destination)} type="button">
        Jump to {label}
      </button>
    </div>
  )
}
