import type { ReactNode } from 'react'

import type { PatchVariant } from './colorThemes'

interface WorkbenchShellProps {
  children: ReactNode
  footer: ReactNode
  notices: ReactNode
  patchVariant: PatchVariant
  sidebar: ReactNode
  telemetry: ReactNode
}

export function WorkbenchShell({ children, footer, notices, patchVariant, sidebar, telemetry }: WorkbenchShellProps) {
  return (
    <main className="workbench-shell" data-color-theme="patch-graph-field" data-patch-variant={patchVariant}>
      <div className="ambient-orbit" aria-hidden="true" />
      <div className="workbench-layout">
        {sidebar}
        <div className="workbench-main-column">
          {children}
          {notices}
        </div>
      </div>
      {telemetry}
      {footer}
    </main>
  )
}
