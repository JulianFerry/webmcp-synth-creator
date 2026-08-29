import type { FilterState, PatchState } from '../../patch/types'

export function EffectsChainStrip({ effects, filter }: { effects: PatchState['effects']; filter: FilterState }) {
  return <div className="effects-chain-strip" aria-label="Shared effects chain">
    <span className={filter.enabled ? 'active' : ''}>Filter</span><i aria-hidden="true">→</i>
    <span className={effects.delay.enabled ? 'active' : ''}>Delay</span><i aria-hidden="true">→</i>
    <span className={effects.reverb.enabled ? 'active' : ''}>Reverb</span>
    <small>shared</small>
  </div>
}
