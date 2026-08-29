import type { ComponentProps } from 'react'
import { AuditionPanel } from '../AuditionPanel'
import { EnvelopePanel } from '../EnvelopePanel'
import { LfoPanel } from '../LfoPanel'
import { OscillatorPanel } from '../OscillatorPanel'
import { ProcessedWaveformPreview } from '../analysis/ProcessedWaveformPreview'
import { SpectrogramWaterfall } from '../analysis/SpectrogramWaterfall'

interface OverviewTabProps {
  audition: ComponentProps<typeof AuditionPanel>
  envelope: ComponentProps<typeof EnvelopePanel>
  lfo: ComponentProps<typeof LfoPanel>
  oscillators: Array<ComponentProps<typeof OscillatorPanel>>
  preview: ComponentProps<typeof ProcessedWaveformPreview>
}

export function OverviewTab({ audition, envelope, lfo, oscillators, preview }: OverviewTabProps) {
  return (
    <div className="tab-grid overview-tab-grid">
      <div className="overview-analysis-row">
        <ProcessedWaveformPreview {...preview} />
        <SpectrogramWaterfall render={preview.render} />
      </div>
      <EnvelopePanel {...envelope} />
      <LfoPanel {...lfo} />
      {oscillators.map((props) => <OscillatorPanel key={props.index} {...props} />)}
      <AuditionPanel {...audition} />
    </div>
  )
}
