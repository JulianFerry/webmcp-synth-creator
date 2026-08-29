import type { ComponentProps } from 'react'
import { OscillatorPanel } from '../OscillatorPanel'

interface OscillatorsTabProps {
  oscillators: Array<ComponentProps<typeof OscillatorPanel>>
}

export function OscillatorsTab({ oscillators }: OscillatorsTabProps) {
  return <div className="tab-grid oscillator-tab-grid">{oscillators.map((props) => <OscillatorPanel key={props.index} {...props} />)}</div>
}
