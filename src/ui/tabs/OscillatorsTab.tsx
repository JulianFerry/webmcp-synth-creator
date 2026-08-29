import type { ComponentProps } from 'react'
import { DetailedOscillatorEditor } from '../oscillators/DetailedOscillatorEditor'
import { OscillatorEditorDeck } from '../oscillators/OscillatorEditorDeck'

interface OscillatorsTabProps {
  oscillators: Array<ComponentProps<typeof DetailedOscillatorEditor>>
}

export function OscillatorsTab({ oscillators }: OscillatorsTabProps) {
  return <OscillatorEditorDeck oscillators={oscillators} />
}
