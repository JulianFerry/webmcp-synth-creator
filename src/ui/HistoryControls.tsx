interface HistoryControlsProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: HistoryControlsProps) {
  return (
    <div aria-label="Patch history" className="history-controls" role="group">
      <button aria-label="Undo transaction" className="toolbar-icon-button" disabled={!canUndo} onClick={onUndo} title="Undo" type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M9 7 5 11l4 4" />
          <path d="M5 11h7a6 6 0 0 1 6 6" />
        </svg>
      </button>
      <button aria-label="Redo transaction" className="toolbar-icon-button" disabled={!canRedo} onClick={onRedo} title="Redo" type="button">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 7 4 4-4 4" />
          <path d="M19 11h-7a6 6 0 0 0-6 6" />
        </svg>
      </button>
    </div>
  )
}
