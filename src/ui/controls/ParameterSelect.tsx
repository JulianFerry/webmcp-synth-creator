interface SelectOption<T extends string> {
  value: T
  label: string
}

interface ParameterSelectProps<T extends string> {
  id: string
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onCommit: (value: T) => void
  disabled?: boolean
  testId?: string
}

export function ParameterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onCommit,
  disabled = false,
  testId,
}: ParameterSelectProps<T>) {
  return (
    <label className="select-control" htmlFor={id}>
      <span>{label}</span>
      <select
        data-testid={testId}
        disabled={disabled}
        id={id}
        onChange={(event) => onCommit(event.currentTarget.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
