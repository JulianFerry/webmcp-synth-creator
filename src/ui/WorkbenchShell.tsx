import type { ReactNode } from 'react'

interface WorkbenchShellProps {
  children: ReactNode
}

export function WorkbenchShell({ children }: WorkbenchShellProps) {
  return (
    <main className="workbench-shell">
      <div className="ambient-orbit" aria-hidden="true" />
      {children}
    </main>
  )
}
