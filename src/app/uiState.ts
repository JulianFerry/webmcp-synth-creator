export type WorkbenchTab = 'overview' | 'oscillators' | 'modulation-effects'

export interface WorkbenchTabMetadata {
  id: WorkbenchTab
  label: string
  panelId: string
  tabId: string
}

export const WORKBENCH_TABS: readonly WorkbenchTabMetadata[] = [
  { id: 'overview', label: 'Overview', tabId: 'tab-overview', panelId: 'panel-overview' },
  {
    id: 'oscillators',
    label: 'Oscillators',
    tabId: 'tab-oscillators',
    panelId: 'panel-oscillators',
  },
  {
    id: 'modulation-effects',
    label: 'Modulation & FX',
    tabId: 'tab-modulation-effects',
    panelId: 'panel-modulation-effects',
  },
] as const

export function tabForPatchPath(path: string): WorkbenchTab {
  if (path.startsWith('oscillators.') || path.startsWith('wavetableData')) return 'oscillators'
  if (
    path.startsWith('filter.') ||
    path.startsWith('effects.') ||
    path.startsWith('modulations') ||
    path.startsWith('modEnvelope.')
  ) {
    return 'modulation-effects'
  }
  return 'overview'
}
