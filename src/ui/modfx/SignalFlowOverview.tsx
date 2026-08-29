import type { ModulationRoute, PatchState } from '../../patch/types'

export function SignalFlowOverview({ modulations, patch }: { modulations: ModulationRoute[]; patch: PatchState }) {
  const stages = ['OSC 1 + 2 + 3', 'FILTER', 'AMP', 'DELAY', 'REVERB']
  return <figure className="panel signal-flow" aria-label="Synthesizer signal flow">
    <figcaption><p className="eyebrow">Patch topology</p><h2>Signal flow</h2></figcaption>
    <div className="signal-flow-stages">{stages.map((stage, index) => <div className="signal-stage" data-bypassed={(stage === 'FILTER' && !patch.filter.enabled) || (stage === 'DELAY' && !patch.effects.delay.enabled) || (stage === 'REVERB' && !patch.effects.reverb.enabled) || undefined} key={stage}><strong>{stage}</strong>{index < stages.length - 1 ? <span aria-hidden="true">→</span> : null}</div>)}</div>
    <div className="route-arcs" aria-label={`${modulations.length} modulation routes`}>{modulations.map((route) => <span key={route.id}>{route.source === 'lfo1' ? 'LFO 1' : 'ENV 2'} ↗ {route.destination}</span>)}</div>
  </figure>
}
