import { useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { HistoryControls } from '../HistoryControls'

import { WORKBENCH_TABS, type WorkbenchTab } from '../../app/uiState'

interface WorkbenchTabsProps {
  active: WorkbenchTab
  assistance: ReactNode
  children: ReactNode
  onChange: (tab: WorkbenchTab) => void
  history: ComponentProps<typeof HistoryControls>
}

export function WorkbenchTabs({ active, assistance, children, history, onChange }: WorkbenchTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % WORKBENCH_TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + WORKBENCH_TABS.length) % WORKBENCH_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = WORKBENCH_TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = WORKBENCH_TABS[nextIndex]
    onChange(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  const metadata = WORKBENCH_TABS.find((tab) => tab.id === active) ?? WORKBENCH_TABS[0]
  return (
    <section className="workbench-stage">
      <div aria-label="Workbench sections" className="workbench-tablist" role="tablist">
        {WORKBENCH_TABS.map((tab, index) => (
          <button
            aria-controls={tab.panelId}
            aria-selected={tab.id === active}
            className="workbench-tab"
            id={tab.tabId}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => moveFocus(event, index)}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            role="tab"
            tabIndex={tab.id === active ? 0 : -1}
            type="button"
          >
            <span>0{index + 1}</span>
            {tab.label}
          </button>
        ))}
        <div className="workbench-tab-actions">
          {assistance}
          <HistoryControls {...history} />
        </div>
      </div>
      <div
        aria-labelledby={metadata.tabId}
        className="workbench-tabpanel"
        id={metadata.panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {children}
      </div>
    </section>
  )
}
