import type { ComponentProps } from 'react'

import { HistoryControls } from '../HistoryControls'
import { PatchHeader } from '../PatchHeader'

interface GlobalPatchBarProps {
  header: ComponentProps<typeof PatchHeader>
  history: ComponentProps<typeof HistoryControls>
}

export function GlobalPatchBar({ header, history }: GlobalPatchBarProps) {
  return (
    <header aria-label="Global patch toolbar" className="global-patch-bar" role="toolbar">
      <h1 className="app-brand">Synth Creator</h1>
      <HistoryControls {...history} />
      <PatchHeader {...header} />
    </header>
  )
}
