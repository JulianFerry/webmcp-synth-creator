import type { PatchCategory, PatchState } from '../patch/types'
import { resolveWavetable } from '../wavetables/registry'
import {
  mapPhaseOneVitalParameters,
  mapStructuredVitalParameters,
  setVitalValues,
  VitalExportError,
} from './parameterMap'
import { buildVitalLfo } from './lfo'
import { buildVitalModulations } from './modulations'
import { importVitalPatch, type VitalImportResult } from './VitalPresetImporter'
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
  if (!Array.isArray(document.settings.wavetables) || document.settings.wavetables.length < 2) {
    throw new VitalExportError('Vital fixture must contain at least two wavetable slots')
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
  return `${safeName || 'wavetable-workbench-patch'}.vital`
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

  exportPatch(patch: PatchState): VitalExportResult {
    const output = structuredClone(this.template)
    setVitalMetadata(output, {
      author: 'Wavetable Workbench',
      comments: patch.metadata.description ?? 'Generated by Wavetable Workbench',
      preset_name: patch.metadata.name,
      preset_style: patch.metadata.category
        ? (CATEGORY_NAMES[patch.metadata.category] ?? 'Other')
        : 'Other',
    })

    setVitalValues(output.settings, {
      ...mapPhaseOneVitalParameters(patch),
      ...mapStructuredVitalParameters(patch),
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

    const modulationSlots = getVitalSlots(output.settings, 'modulations')
    const modulationExport = buildVitalModulations(patch.modulations, modulationSlots.length, {
      lfo1: patch.lfo1.enabled,
      modEnvelope: true,
    })
    setVitalValues(output.settings, modulationExport.values)
    replaceVitalSlots(output.settings, 'modulations', modulationExport.routes)

    const filename = vitalFilename(patch.metadata.name)
    return {
      document: output,
      filename,
      json: JSON.stringify(output),
    }
  }

  importPatch(value: unknown): VitalImportResult {
    return importVitalPatch(value, this.template)
  }

  downloadPatch(patch: PatchState): string {
    const exported = this.exportPatch(patch)
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(
      new Blob([exported.json], { type: 'application/json;charset=utf-8' }),
    )
    anchor.download = exported.filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 4_000)
    return exported.filename
  }
}
