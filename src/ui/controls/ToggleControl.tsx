interface ToggleControlProps {
  label: string
  checked: boolean
  onCommit: (checked: boolean) => void
  disabled?: boolean
  testId?: string
}

export function ToggleControl({
  label,
  checked,
  onCommit,
  disabled = false,
  testId,
}: ToggleControlProps) {
  return (
    <button
      aria-label={label}
      aria-checked={checked}
      className={checked ? 'toggle-control active' : 'toggle-control'}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onCommit(!checked)}
      role="switch"
      type="button"
    >
      <span>{label}</span>
      <i aria-hidden="true" />
      <strong>{checked ? 'On' : 'Off'}</strong>
    </button>
  )
}
