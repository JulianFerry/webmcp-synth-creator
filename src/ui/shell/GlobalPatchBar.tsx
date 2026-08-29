import type { ComponentProps } from 'react'

import { HistoryControls } from '../HistoryControls'
import { PatchHeader } from '../PatchHeader'
import { VariantSwitcher } from '../VariantSwitcher'
import type { LastChangeIndicator } from './LastChangeIndicator'

interface GlobalPatchBarProps {
  header: ComponentProps<typeof PatchHeader>
  history: ComponentProps<typeof HistoryControls>
  variant: ComponentProps<typeof VariantSwitcher>
  audioLifecycle: string
  activeVoiceCount: number
  lastChange: ComponentProps<typeof LastChangeIndicator>
  LastChange: typeof LastChangeIndicator
}

export function GlobalPatchBar({ header, history, variant, audioLifecycle, activeVoiceCount, lastChange, LastChange }: GlobalPatchBarProps) {
  return (
    <header className="global-patch-bar">
      <PatchHeader {...header} />
      <div className="global-session-row">
        <VariantSwitcher {...variant} />
        <HistoryControls {...history} />
        <div className={`global-audio-status status-${audioLifecycle}`}>
          <span>Audio</span>
          <strong data-testid="audio-lifecycle">{audioLifecycle}</strong>
          <small>{activeVoiceCount} active</small>
        </div>
      </div>
      <LastChange {...lastChange} />
    </header>
  )
}
