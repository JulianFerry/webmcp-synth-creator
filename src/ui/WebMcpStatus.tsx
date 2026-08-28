import type { CapabilityStatus } from '../app/appStore'

interface WebMcpStatusProps {
  status: CapabilityStatus
  reason: string | null
}

export function WebMcpStatus({ status, reason }: WebMcpStatusProps) {
  const guidance =
    status === 'available'
      ? 'Patch creation, curated starts, focused edits, A/B, and history tools are registered.'
      : status === 'checking'
        ? 'Checking document.modelContext and registering tools.'
        : (reason ??
          'Use current Chrome, enable chrome://flags/#enable-webmcp-testing, and serve a secure origin.')

  return (
    <div
      className={`status-cell status-${status} webmcp-status-cell`}
      data-testid="webmcp-status"
    >
      <span>WebMCP</span>
      <strong>{status}</strong>
      <small>{guidance}</small>
    </div>
  )
}
