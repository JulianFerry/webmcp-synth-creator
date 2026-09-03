import type { ComponentProps } from 'react'
import { EnvelopePanel } from '../EnvelopePanel'
import { LfoPanel } from '../LfoPanel'
import { DetailedOscillatorEditor } from '../oscillators/DetailedOscillatorEditor'

interface OscillatorsTabProps {
  envelope: ComponentProps<typeof EnvelopePanel>
  lfos: [ComponentProps<typeof LfoPanel>, ComponentProps<typeof LfoPanel>]
  oscillators: Array<ComponentProps<typeof DetailedOscillatorEditor>>
}

export function OscillatorsTab({ envelope, lfos, oscillators }: OscillatorsTabProps) {
  return <div className="oscillators-workspace">
    {oscillators.map((oscillator) => <DetailedOscillatorEditor key={oscillator.index} {...oscillator} />)}
    <EnvelopePanel {...envelope} />
    <LfoPanel {...lfos[0]} />
    <LfoPanel {...lfos[1]} />
  </div>
}
