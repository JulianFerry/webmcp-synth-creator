import type { ComponentProps } from 'react'
import { AuditionPanel } from '../AuditionPanel'
import { EnvelopePanel } from '../EnvelopePanel'
import { LfoPanel } from '../LfoPanel'
import { OscillatorPanel } from '../OscillatorPanel'

interface OverviewTabProps {
  audition: ComponentProps<typeof AuditionPanel>
  envelope: ComponentProps<typeof EnvelopePanel>
  lfo: ComponentProps<typeof LfoPanel>
  oscillators: Array<ComponentProps<typeof OscillatorPanel>>
}

export function OverviewTab({ audition, envelope, lfo, oscillators }: OverviewTabProps) {
  return (
    <div className="tab-grid overview-tab-grid">
      <EnvelopePanel {...envelope} />
      <LfoPanel {...lfo} />
      {oscillators.map((props) => <OscillatorPanel key={props.index} {...props} />)}
      <AuditionPanel {...audition} />
    </div>
  )
}
