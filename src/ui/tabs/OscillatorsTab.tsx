import type { ComponentProps } from 'react'
import { EnvelopePanel } from '../EnvelopePanel'
import { LfoPanel } from '../LfoPanel'
import { DetailedOscillatorEditor } from '../oscillators/DetailedOscillatorEditor'
import { OscillatorEditorDeck } from '../oscillators/OscillatorEditorDeck'

interface OscillatorsTabProps {
  envelope: ComponentProps<typeof EnvelopePanel>
  lfos: [ComponentProps<typeof LfoPanel>, ComponentProps<typeof LfoPanel>]
  oscillators: Array<ComponentProps<typeof DetailedOscillatorEditor>>
}

export function OscillatorsTab({ envelope, lfos, oscillators }: OscillatorsTabProps) {
  return <div className="oscillators-workspace">
    <OscillatorEditorDeck oscillators={oscillators} />
    <div className="oscillator-modulator-row"><EnvelopePanel {...envelope} /></div>
    <div className="oscillator-lfo-row">
      <LfoPanel {...lfos[0]} />
      <LfoPanel {...lfos[1]} />
    </div>
  </div>
}
