import type { ComponentProps } from 'react'
import { EffectsPanel } from '../EffectsPanel'
import { FilterPanel } from '../FilterPanel'
import { LfoPanel } from '../LfoPanel'
import { ModulationPanel } from '../ModulationPanel'

interface ModulationEffectsTabProps {
  effects: ComponentProps<typeof EffectsPanel>
  filter: ComponentProps<typeof FilterPanel>
  lfo: ComponentProps<typeof LfoPanel>
  modulation: ComponentProps<typeof ModulationPanel>
}

export function ModulationEffectsTab({ effects, filter, lfo, modulation }: ModulationEffectsTabProps) {
  return <div className="tab-grid modfx-tab-grid"><ModulationPanel {...modulation} /><LfoPanel {...lfo} /><FilterPanel {...filter} /><EffectsPanel {...effects} /></div>
}
