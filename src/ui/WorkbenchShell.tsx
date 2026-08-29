import type { ReactNode } from 'react'

interface WorkbenchShellProps {
  children: ReactNode
  bar: ReactNode
  diagnostics: ReactNode
  notices: ReactNode
}

export function WorkbenchShell({ bar, children, diagnostics, notices }: WorkbenchShellProps) {
  return (
    <main className="workbench-shell">
      <div className="ambient-orbit" aria-hidden="true" />
      {bar}
      {children}
      {diagnostics}
      {notices}
    </main>
  )
}
