import type { ComponentProps } from 'react'
import { AuditionPanel } from '../AuditionPanel'
import { EnvelopePanel } from '../EnvelopePanel'
import { LfoPanel } from '../LfoPanel'
import type { FilterState, PatchState } from '../../patch/types'
import type { DetailedOscillatorEditorProps } from '../oscillators/DetailedOscillatorEditor'
import { OscillatorOverviewDeck } from '../overview/OscillatorOverviewDeck'
import { ProcessedWaveformPreview } from '../analysis/ProcessedWaveformPreview'
import { SpectrogramWaterfall } from '../analysis/SpectrogramWaterfall'

interface OverviewTabProps {
  audition: ComponentProps<typeof AuditionPanel>
  envelope: ComponentProps<typeof EnvelopePanel>
  lfo: ComponentProps<typeof LfoPanel>
  oscillators: DetailedOscillatorEditorProps[]
  preview: ComponentProps<typeof ProcessedWaveformPreview>
  effects: PatchState['effects']
  filter: FilterState
}

export function OverviewTab({ audition, effects, envelope, filter, lfo, oscillators, preview }: OverviewTabProps) {
  return (
    <div className="tab-grid overview-tab-grid">
      <div className="overview-analysis-row">
        <ProcessedWaveformPreview {...preview} />
        <SpectrogramWaterfall render={preview.render} />
      </div>
      <EnvelopePanel {...envelope} />
      <LfoPanel {...lfo} />
      <OscillatorOverviewDeck oscillators={oscillators.map((props) => ({ ...props, effects, filter }))} />
      <AuditionPanel {...audition} />
    </div>
  )
}
