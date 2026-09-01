import type { OscillatorOverviewCardProps } from './OscillatorOverviewCard'
import { OscillatorOverviewCard } from './OscillatorOverviewCard'

export function OscillatorOverviewDeck({ oscillators }: { oscillators: OscillatorOverviewCardProps[] }) {
  return <section className="oscillator-overview-deck" aria-label="Oscillator overview">{oscillators.map((oscillator) => <OscillatorOverviewCard key={oscillator.index} {...oscillator} />)}</section>
}
