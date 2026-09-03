import type { PatchCategory, PatchState } from '../patch/types'
import { WORKBENCH_LFO_ROUTES, withWorkbenchLfoRouting } from '../patch/modulation'
import { resolveWavetable } from '../wavetables/registry'
import {
  decodeFloatToOrder,
  encodeOrderToFloat,
  VITAL_EFFECT_COUNT,
  VITAL_EFFECT_INDEX,
} from './effectOrder'
import {
  mapPhaseOneVitalParameters,
  mapStructuredVitalParameters,
  setVitalValues,
  VitalExportError,
} from './parameterMap'
import { buildVitalLfo } from './lfo'
import { buildVitalModulations } from './modulations'
import {
  VITAL_MODULATION_DESTINATIONS,
  VITAL_MODULATION_SOURCES,
} from './modulations'
import {
  importVitalPatch,
  type VitalImportOptions,
  type VitalImportResult,
} from './VitalPresetImporter'
import { buildVitalWavetable } from './wavetable'

export interface VitalPresetDocument {
  author?: string
  comments?: string
  preset_name?: string
  preset_style?: string
  synth_version: string
  settings: Record<string, unknown> & {
    wavetables?: unknown[]
    lfos?: unknown[]
    modulations?: unknown[]
  }
  [key: string]: unknown
}

export interface VitalExportResult {
  document: VitalPresetDocument
  filename: string
  json: string
}

export interface ImportedVitalBacking {
  affectedControls: ImportedVitalAffectedControl[]
  document: VitalPresetDocument
  editableBaseline: PatchState
  hiddenEffects: string[]
  originalJson: string
  preservesUnsupportedFeatures: boolean
  sourceFilename?: string
  sourceVersion: string
  warnings: string[]
}

export interface ImportedVitalAffectedControl {
  control: string
  sources: string[]
}

export interface VitalBackedImportResult extends VitalImportResult {
  backing: ImportedVitalBacking
}

export interface VitalControlOperation {
  name: string
  value: number
}

const CATEGORY_NAMES: Partial<Record<PatchCategory, string>> = {
  pad: 'Pad',
  bass: 'Bass',
  lead: 'Lead',
  pluck: 'Pluck',
  keys: 'Keys',
  atmosphere: 'Atmosphere',
  rhythmic: 'Sequence',
  other: 'Other',
}

function assertVitalDocument(value: unknown): asserts value is VitalPresetDocument {
  if (!value || typeof value !== 'object') throw new VitalExportError('Vital fixture is not an object')
  const document = value as Partial<VitalPresetDocument>
  if (!document.settings || typeof document.settings !== 'object') {
    throw new VitalExportError('Vital fixture has no settings object')
  }
  if (!document.synth_version || typeof document.synth_version !== 'string') {
    throw new VitalExportError('Vital fixture has no pinned synth_version')
  }
  if (!Array.isArray(document.settings.wavetables) || document.settings.wavetables.length < 3) {
    throw new VitalExportError('Vital fixture must contain at least three wavetable slots')
  }
  if (!Array.isArray(document.settings.lfos) || document.settings.lfos.length < 1) {
    throw new VitalExportError('Vital fixture must contain at least one LFO slot')
  }
  if (
    !Array.isArray(document.settings.modulations) ||
    document.settings.modulations.length < 1
  ) {
    throw new VitalExportError('Vital fixture must contain modulation slots')
  }
  for (const key of ['author', 'comments', 'preset_name', 'preset_style'] as const) {
    if (!(key in document) || typeof document[key] !== 'string') {
      throw new VitalExportError(`Vital fixture has no ${key} metadata field`)
    }
  }
}

function setVitalMetadata(
  document: VitalPresetDocument,
  values: Record<'author' | 'comments' | 'preset_name' | 'preset_style', string>,
): void {
  for (const key of Object.keys(values)) {
    if (!(key in document)) throw new VitalExportError(`Unknown Vital metadata field: ${key}`)
  }
  Object.assign(document, values)
}

type VitalSlotKey = 'wavetables' | 'lfos' | 'modulations'

function getVitalSlots(settings: VitalPresetDocument['settings'], key: VitalSlotKey): unknown[] {
  const slots = settings[key]
  if (!Array.isArray(slots)) throw new VitalExportError(`Vital fixture has no ${key} slots`)
  return slots
}

function replaceVitalSlot(slots: unknown[], index: number, value: unknown, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    throw new VitalExportError(`Vital fixture has no ${label} slot ${index + 1}`)
  }
  slots[index] = value
}

function replaceVitalSlots(
  settings: VitalPresetDocument['settings'],
  key: VitalSlotKey,
  values: unknown[],
): void {
  const slots = getVitalSlots(settings, key)
  if (slots.length !== values.length) {
    throw new VitalExportError(
      `Vital ${key} slot count changed from ${slots.length} to ${values.length}`,
    )
  }
  slots.splice(0, slots.length, ...values)
}

export function vitalFilename(name: string): string {
  const safeName = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${safeName || 'webmcp-synth-creator-patch'}.vital`
}

export class VitalPresetAdapter {
  private readonly template: VitalPresetDocument

  constructor(template: unknown) {
    assertVitalDocument(template)
    this.template = structuredClone(template)
  }

  static async fromUrl(
    url = '/fixtures/vital/init.vital',
    fetchImplementation: typeof fetch = fetch,
  ): Promise<VitalPresetAdapter> {
    const response = await fetchImplementation(url)
    if (!response.ok) {
      throw new VitalExportError(`Unable to load Vital Init fixture (${response.status})`)
    }
    const text = await response.text()
    try {
      return new VitalPresetAdapter(JSON.parse(text))
    } catch (error) {
      if (error instanceof VitalExportError) throw error
      throw new VitalExportError('Vital Init fixture is not valid JSON')
    }
  }

  exportPatch(patch: PatchState, backing: ImportedVitalBacking | null = null): VitalExportResult {
    patch = withWorkbenchLfoRouting(patch)
    if (backing !== null) return this.exportRetainedPatch(patch, backing)

    const output = structuredClone(this.template)
    const modulationSlots = getVitalSlots(output.settings, 'modulations')
    const modulationExport = buildVitalModulations(patch.modulations, modulationSlots.length, {
      lfo1: patch.lfo1.enabled,
      modEnvelope: true,
    })
    setVitalMetadata(output, {
      author: 'WebMCP Synth Creator',
      comments: patch.metadata.description ?? 'Generated by WebMCP Synth Creator',
      preset_name: patch.metadata.name,
      preset_style: patch.metadata.category
        ? (CATEGORY_NAMES[patch.metadata.category] ?? 'Other')
        : 'Other',
    })

    setVitalValues(output.settings, {
      ...this.mapControlValues(patch),
    })

    const wavetables = getVitalSlots(output.settings, 'wavetables')
    patch.oscillators.forEach((oscillator, index) => {
      const wavetable = resolveWavetable(patch.wavetableData, oscillator.wavetableId)
      replaceVitalSlot(
        wavetables,
        index,
        buildVitalWavetable(wavetable, output.synth_version),
        'wavetable',
      )
    })

    const lfos = getVitalSlots(output.settings, 'lfos')
    replaceVitalSlot(lfos, 0, buildVitalLfo(patch.lfo1), 'LFO')

    replaceVitalSlots(output.settings, 'modulations', modulationExport.routes)

    const filename = vitalFilename(patch.metadata.name)
    return {
      document: output,
      filename,
      json: JSON.stringify(output),
    }
  }

  controlOperations(
    before: PatchState,
    after: PatchState,
    backing: ImportedVitalBacking | null = null,
  ): VitalControlOperation[] {
    before = withWorkbenchLfoRouting(before)
    after = withWorkbenchLfoRouting(after)
    const beforeValues = this.mapControlValues(before)
    const afterValues = this.mapControlValues(after)
    const operations: VitalControlOperation[] = []

    for (const [name, value] of Object.entries(afterValues)) {
      if (Object.is(beforeValues[name], value)) continue
      if (backing !== null && name.startsWith('modulation_')) continue
      if (backing !== null && name === 'effect_chain_order') continue
      operations.push({ name, value })
    }

    if (backing !== null && !valuesEqual(before.effects.order, after.effects.order)) {
      operations.push({
        name: 'effect_chain_order',
        value: retainedEffectOrder(backing.document.settings.effect_chain_order, after.effects.order),
      })
    }

    if (backing !== null && before.lfo1.enabled !== after.lfo1.enabled) {
      operations.push(...retainedLfoBypassOperations(backing.document, after.lfo1.enabled))
    }
    return operations
  }

  importPatch(
    value: unknown,
    options: VitalImportOptions & { originalJson?: string } = {},
  ): VitalBackedImportResult {
    const imported = importVitalPatch(value, this.template, options)
    const document = structuredClone(value) as VitalPresetDocument
    const nativeFeatures = summarizeNativeFeatures(document)
    return {
      ...imported,
      backing: {
        affectedControls: nativeFeatures.affectedControls,
        document,
        editableBaseline: structuredClone(imported.patch),
        hiddenEffects: nativeFeatures.hiddenEffects,
        originalJson: options.originalJson ?? JSON.stringify(value),
        preservesUnsupportedFeatures: imported.patch.metadata.tags.includes('vital-lossy'),
        ...(options.sourceFilename ? { sourceFilename: options.sourceFilename } : {}),
        sourceVersion: imported.sourceVersion,
        warnings: [...imported.warnings],
      },
    }
  }

  downloadPatch(patch: PatchState, backing: ImportedVitalBacking | null = null): string {
    const exported = this.exportPatch(patch, backing)
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(
      new Blob([exported.json], { type: 'application/json;charset=utf-8' }),
    )
    anchor.download = exported.filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 4_000)
    return exported.filename
  }

  private mapControlValues(patch: PatchState): Record<string, number> {
    const modulationSlotCount = getVitalSlots(this.template.settings, 'modulations').length
    const modulationValues = buildVitalModulations(patch.modulations, modulationSlotCount, {
      lfo1: patch.lfo1.enabled,
      modEnvelope: true,
    }).values
    return {
      ...mapPhaseOneVitalParameters(patch),
      ...mapStructuredVitalParameters(patch),
      ...modulationValues,
    }
  }

  private exportRetainedPatch(
    patch: PatchState,
    backing: ImportedVitalBacking,
  ): VitalExportResult {
    const filename = vitalFilename(patch.metadata.name)
    if (valuesEqual(patch, backing.editableBaseline)) {
      return {
        document: structuredClone(backing.document),
        filename,
        json: backing.originalJson,
      }
    }

    const output = structuredClone(backing.document)
    const baseline = backing.editableBaseline
    if (patch.metadata.name !== baseline.metadata.name) output.preset_name = patch.metadata.name
    if (patch.metadata.description !== baseline.metadata.description) {
      output.comments = patch.metadata.description ?? ''
    }
    if (patch.metadata.category !== baseline.metadata.category) {
      output.preset_style = patch.metadata.category
        ? (CATEGORY_NAMES[patch.metadata.category] ?? 'Other')
        : 'Other'
    }

    for (const operation of this.controlOperations(baseline, patch, backing)) {
      output.settings[operation.name] = operation.value
    }

    const outputWavetables = output.settings.wavetables
    const baselineWavetables = baseline.wavetableData
    if (Array.isArray(outputWavetables)) {
      patch.oscillators.forEach((oscillator, index) => {
        const baselineOscillator = baseline.oscillators[index]
        const wavetableChanged =
          oscillator.wavetableId !== baselineOscillator.wavetableId ||
          !valuesEqual(
            patch.wavetableData[oscillator.wavetableId],
            baselineWavetables[baselineOscillator.wavetableId],
          )
        if (!wavetableChanged) return
        outputWavetables[index] = buildVitalWavetable(
          resolveWavetable(patch.wavetableData, oscillator.wavetableId),
          output.synth_version,
        )
      })
    }

    const outputLfos = output.settings.lfos
    if (Array.isArray(outputLfos) && outputLfos.length > 0) {
      if (!valuesEqual(patch.lfo1.points, baseline.lfo1.points)) {
        outputLfos[0] = buildVitalLfo(patch.lfo1)
      } else if (
        patch.lfo1.smooth !== baseline.lfo1.smooth &&
        outputLfos[0] !== null &&
        typeof outputLfos[0] === 'object'
      ) {
        ;(outputLfos[0] as Record<string, unknown>).smooth = patch.lfo1.smooth
      }
    }

    if (!valuesEqual(patch.lfo1, baseline.lfo1)) {
      applyRetainedWorkbenchLfoRouting(output, patch.lfo1.enabled)
    }

    return { document: output, filename, json: JSON.stringify(output) }
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

const HIDDEN_EFFECT_CONTROLS = [
  ['distortion_on', 'Distortion'],
  ['compressor_on', 'Compressor'],
  ['chorus_on', 'Chorus'],
  ['eq_on', 'Equalizer'],
  ['flanger_on', 'Flanger'],
  ['phaser_on', 'Phaser'],
  ['filter_1_on', 'Filter 1'],
  ['filter_2_on', 'Filter 2'],
] as const

const EDITABLE_CONTROL_LABELS: Record<string, string> = {
  osc_1_level: 'OSC 1 level',
  osc_1_wave_frame: 'OSC 1 wavetable position',
  osc_1_transpose: 'OSC 1 pitch',
  osc_1_tune: 'OSC 1 fine tune',
  osc_1_unison_voices: 'OSC 1 unison voices',
  osc_1_unison_detune: 'OSC 1 unison detune',
  osc_1_stereo_spread: 'OSC 1 stereo spread',
  osc_1_random_phase: 'OSC 1 random phase',
  osc_2_level: 'OSC 2 level',
  osc_2_wave_frame: 'OSC 2 wavetable position',
  osc_2_transpose: 'OSC 2 pitch',
  osc_2_tune: 'OSC 2 fine tune',
  osc_2_unison_voices: 'OSC 2 unison voices',
  osc_2_unison_detune: 'OSC 2 unison detune',
  osc_2_stereo_spread: 'OSC 2 stereo spread',
  osc_2_random_phase: 'OSC 2 random phase',
  osc_3_level: 'OSC 3 level',
  osc_3_wave_frame: 'OSC 3 wavetable position',
  osc_3_transpose: 'OSC 3 pitch',
  osc_3_tune: 'OSC 3 fine tune',
  osc_3_unison_voices: 'OSC 3 unison voices',
  osc_3_unison_detune: 'OSC 3 unison detune',
  osc_3_stereo_spread: 'OSC 3 stereo spread',
  osc_3_random_phase: 'OSC 3 random phase',
  env_1_attack: 'amp attack',
  env_1_hold: 'amp hold',
  env_1_decay: 'amp decay',
  env_1_sustain: 'amp sustain',
  env_1_release: 'amp release',
  filter_fx_cutoff: 'filter cutoff',
  filter_fx_resonance: 'filter resonance',
  lfo_1_frequency: 'LFO rate',
  lfo_1_tempo: 'LFO rate',
  lfo_1_phase: 'LFO phase',
  lfo_1_smooth_time: 'LFO smoothing',
  delay_frequency: 'delay time',
  delay_aux_frequency: 'delay time',
  delay_feedback: 'delay feedback',
  delay_dry_wet: 'delay mix',
  reverb_dry_wet: 'reverb mix',
  reverb_decay_time: 'reverb decay',
  reverb_size: 'reverb size',
}

function summarizeNativeFeatures(document: VitalPresetDocument): {
  affectedControls: ImportedVitalAffectedControl[]
  hiddenEffects: string[]
} {
  const settings = document.settings
  const hiddenEffects = HIDDEN_EFFECT_CONTROLS.flatMap(([control, label]) =>
    Number(settings[control]) >= 0.5 ? [label] : [],
  )
  const sourcesByControl = new Map<string, Set<string>>()
  const routes = Array.isArray(settings.modulations) ? settings.modulations : []
  const workbenchRouteIndexes = findWorkbenchLfoRouteIndexes(settings, routes)

  routes.forEach((route, index) => {
    if (route === null || typeof route !== 'object') return
    const { source, destination } = route as Record<string, unknown>
    if (typeof source !== 'string' || typeof destination !== 'string') return
    const control = EDITABLE_CONTROL_LABELS[destination]
    if (!control || workbenchRouteIndexes.has(index)) return
    const slot = index + 1
    if (Number(settings[`modulation_${slot}_bypass`]) >= 0.5) return
    if (Number(settings[`modulation_${slot}_amount`]) === 0) return
    const sources = sourcesByControl.get(control) ?? new Set<string>()
    sources.add(formatModulationSource(source))
    sourcesByControl.set(control, sources)
  })

  return {
    affectedControls: [...sourcesByControl].map(([control, sources]) => ({
      control,
      sources: [...sources],
    })),
    hiddenEffects,
  }
}

function findWorkbenchLfoRouteIndexes(
  settings: Record<string, unknown>,
  routes: unknown[],
): Set<number> {
  const indexes = new Map<string, number>()
  routes.forEach((route, index) => {
    if (route === null || typeof route !== 'object') return
    const { source, destination } = route as Record<string, unknown>
    const expectedRoute = WORKBENCH_LFO_ROUTES.find(
      ({ destination: logicalDestination }) =>
        VITAL_MODULATION_DESTINATIONS[logicalDestination] === destination,
    )
    if (
      source === VITAL_MODULATION_SOURCES.lfo1 &&
      expectedRoute !== undefined &&
      Number(settings[`modulation_${index + 1}_amount`]) === expectedRoute.amount
    ) {
      indexes.set(expectedRoute.destination, index)
    }
  })
  return indexes.size === WORKBENCH_LFO_ROUTES.length
    ? new Set(indexes.values())
    : new Set<number>()
}

function formatModulationSource(source: string): string {
  const macro = /^macro_control_([1-4])$/.exec(source)
  if (macro) return `Macro ${macro[1]}`
  const lfo = /^lfo_(\d+)$/.exec(source)
  if (lfo) return `LFO ${lfo[1]}`
  const envelope = /^env_(\d+)$/.exec(source)
  if (envelope) return `Envelope ${envelope[1]}`
  return source
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function retainedEffectOrder(value: unknown, modeledOrder: PatchState['effects']['order']): number {
  try {
    const original = decodeFloatToOrder(Math.round(Number(value)), VITAL_EFFECT_COUNT)
    const modeledIndexes = new Set<number>(Object.values(VITAL_EFFECT_INDEX))
    const reorderedModeled = modeledOrder.map((effect) => VITAL_EFFECT_INDEX[effect])
    let modeledIndex = 0
    const retained = original.map((effectIndex) =>
      modeledIndexes.has(effectIndex) ? reorderedModeled[modeledIndex++] : effectIndex,
    )
    return encodeOrderToFloat(retained)
  } catch {
    return encodeOrderToFloat([
      ...modeledOrder.map((effect) => VITAL_EFFECT_INDEX[effect]),
      4,
      6,
      7,
    ])
  }
}

function retainedLfoBypassOperations(
  document: VitalPresetDocument,
  enabled: boolean,
): VitalControlOperation[] {
  return retainedWorkbenchLfoSlots(document).map((index) => ({
    name: `modulation_${index + 1}_bypass`,
    value: Number(!enabled),
  }))
}

function applyRetainedWorkbenchLfoRouting(
  document: VitalPresetDocument,
  enabled: boolean,
): void {
  const routes = document.settings.modulations
  if (!Array.isArray(routes)) throw new VitalExportError('Imported Vital preset has no modulation slots')
  const slots = retainedWorkbenchLfoSlots(document)
  slots.forEach((index, routeIndex) => {
    const route = WORKBENCH_LFO_ROUTES[routeIndex]
    routes[index] = {
      source: VITAL_MODULATION_SOURCES.lfo1,
      destination: VITAL_MODULATION_DESTINATIONS[route.destination],
    }
    const slot = index + 1
    document.settings[`modulation_${slot}_amount`] = route.amount
    document.settings[`modulation_${slot}_bipolar`] = 0
    document.settings[`modulation_${slot}_stereo`] = 0
    document.settings[`modulation_${slot}_power`] = 0
    document.settings[`modulation_${slot}_bypass`] = Number(!enabled)
  })
}

function retainedWorkbenchLfoSlots(document: VitalPresetDocument): number[] {
  const routes = document.settings.modulations
  if (!Array.isArray(routes)) return []
  const available = routes.flatMap((route, index) => {
    if (
      route !== null &&
      typeof route === 'object' &&
      (route as Record<string, unknown>).source === '' &&
      (route as Record<string, unknown>).destination === ''
    ) {
      return [index]
    }
    return []
  })
  if (available.length < WORKBENCH_LFO_ROUTES.length) {
    throw new VitalExportError(
      `Imported Vital preset needs ${WORKBENCH_LFO_ROUTES.length} free modulation slots for the Workbench LFO`,
    )
  }
  return available.slice(0, WORKBENCH_LFO_ROUTES.length)
}
