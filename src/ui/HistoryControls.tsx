interface HistoryControlsProps {
  canUndo: boolean
  canRedo: boolean
  historySize: number
  futureSize: number
  onUndo: () => void
  onRedo: () => void
}

export function HistoryControls({
  canUndo,
  canRedo,
  historySize,
  futureSize,
  onUndo,
  onRedo,
}: HistoryControlsProps) {
  return (
    <div className="history-controls">
      <div className="history-readout" aria-live="polite">
        <span>Selected history</span>
        <strong data-testid="history-readout">
          {historySize} past / {futureSize} future
        </strong>
      </div>
      <button className="button button-quiet" disabled={!canUndo} onClick={onUndo} type="button">
        Undo transaction
      </button>
      <button className="button button-quiet" disabled={!canRedo} onClick={onRedo} type="button">
        Redo transaction
      </button>
    </div>
  )
}
