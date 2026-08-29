import { MODULATION_DESTINATIONS_BY_SOURCE } from '../../patch/modulation'
import type { ModulationRoute, ModulationSource } from '../../patch/types'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import { ToggleControl } from '../controls/ToggleControl'

interface Props {
  modulations: ModulationRoute[]
  resetKey: number
  onChange: (modulations: ModulationRoute[]) => boolean
}

const SOURCES = [
  { value: 'lfo1', label: 'LFO 1' },
  { value: 'modEnvelope', label: 'ENV 2' },
] satisfies Array<{ value: ModulationSource; label: string }>

const destinationLabel = (value: string) => value.replace('oscillator', 'Osc ').replace('.wavetablePosition', ' position').replace('.level', ' level').replace('.pitch', ' pitch').replace('filter.cutoff', 'Filter cutoff')

export function ModulationMatrixEditor({ modulations, resetKey, onChange }: Props) {
  const update = (index: number, change: Partial<ModulationRoute>) => {
    const next = modulations.map((route, routeIndex) => routeIndex === index ? { ...route, ...change } : route)
    return onChange(next)
  }
  const add = () => {
    if (modulations.length >= 16) return
    const existing = new Set(modulations.map((route) => `${route.source}:${route.destination}`))
    const pairs = SOURCES.flatMap(({ value: source }) => MODULATION_DESTINATIONS_BY_SOURCE[source].map((destination) => ({ source, destination })))
    const pair = pairs.find(({ source, destination }) => source === 'lfo1' && destination === 'oscillator3.wavetablePosition' && !existing.has(`${source}:${destination}`)) ?? pairs.find(({ source, destination }) => !existing.has(`${source}:${destination}`))
    if (!pair) return
    onChange([...modulations, { id: crypto.randomUUID(), ...pair, amount: 0.5, bipolar: false }])
  }

  return <article className="panel modulation-matrix-editor">
    <div className="panel-heading"><div><p className="eyebrow">Writable destination matrix</p><h2>Routing matrix</h2></div><span className="count-chip"><span data-testid="modulation-route-count">{modulations.length} routes</span> / 16</span></div>
    <div className="matrix-routes" data-testid="modulation-routes">
      {modulations.map((route, index) => <section aria-label={`Modulation route ${index + 1}`} className="matrix-route" key={route.id}>
        <ParameterSelect id={`route-${index}-source`} label="Source" onCommit={(source) => update(index, { source, destination: MODULATION_DESTINATIONS_BY_SOURCE[source][0] })} options={SOURCES} testId={`route-${index}-source`} value={route.source} />
        <ParameterSelect id={`route-${index}-destination`} label="Destination" onCommit={(destination) => update(index, { destination })} options={MODULATION_DESTINATIONS_BY_SOURCE[route.source].map((value) => ({ value, label: destinationLabel(value) }))} testId={`route-${index}-destination`} value={route.destination} />
        <ParameterSlider formatValue={(value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`} id={`route-${index}-amount`} label="Amount" max={1} min={-1} onCommit={(amount) => update(index, { amount })} resetKey={resetKey} step={0.01} testId={`route-${index}-amount`} value={route.amount} />
        <ToggleControl checked={route.bipolar} label="Bipolar" onCommit={(bipolar) => update(index, { bipolar })} testId={`route-${index}-bipolar`} />
        <button aria-label={`Remove modulation route ${index + 1}`} className="button button-quiet matrix-remove" onClick={() => onChange(modulations.filter((_, routeIndex) => routeIndex !== index))} type="button">Remove</button>
      </section>)}
      {modulations.length === 0 ? <p className="gesture-note">No routes. Add one to connect a modulator to the signal path.</p> : null}
    </div>
    <button className="button matrix-add" data-testid="add-modulation-route" disabled={modulations.length >= 16} onClick={add} type="button">Add route</button>
  </article>
}
