import type { DetailedOscillatorEditorProps } from './DetailedOscillatorEditor'
import { DetailedOscillatorEditor } from './DetailedOscillatorEditor'

export function OscillatorEditorDeck({ oscillators }: { oscillators: DetailedOscillatorEditorProps[] }) {
  return (
    <section aria-label="Detailed oscillator editors" className="oscillator-editor-deck" data-testid="oscillator-editor-deck">
      {oscillators.map((oscillator) => <DetailedOscillatorEditor key={oscillator.index} {...oscillator} />)}
    </section>
  )
}
