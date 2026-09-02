import { parsePatchState } from '../patch/schemas'
import { DEFAULT_EFFECT_ORDER, type EffectId } from '../patch/effects'
import {
  DELAY_TIME_MAX_SECONDS,
  DELAY_TIME_MIN_SECONDS,
  ENVELOPE_HOLD_MAX_SECONDS,
  FILTER_CUTOFF_MAX_HZ,
  FILTER_CUTOFF_MIN_HZ,
  REVERB_DECAY_MAX_SECONDS,
  REVERB_DECAY_MIN_SECONDS,
  type TempoSyncDivision,
} from '../patch/limits'
import type {
  EnvelopeState,
  FilterType,
  LfoRate,
  LfoState,
  ModulationDestination,
  ModulationRoute,
  ModulationSource,
  OscillatorState,
  PatchCategory,
  PatchState,
  WavetableFrameState,
  WavetableState,
} from '../patch/types'
import { WAVETABLE_REGISTRY } from '../wavetables/registry'
import { renderWavetableFrame, VITAL_FRAME_SAMPLE_COUNT } from '../wavetables/render'
import { decodeVitalLfoPointValue } from './lfo'
import {
  decodeVitalEffectOrder,
  VITAL_EFFECT_ORDER_MAX,
} from './effectOrder'
import { decodeVitalFxFilterType } from './filter'
import {
  VITAL_MODULATION_DESTINATIONS,
  VITAL_MODULATION_SOURCES,
} from './modulations'
import type { VitalPresetDocument } from './VitalPresetAdapter'
import {
  decodeVitalDelaySeconds,
  decodeVitalEnvelopeSeconds,
  decodeVitalGlideSeconds,
  decodeVitalReverbDecaySeconds,
} from './units'
import { buildVitalWavetable } from './wavetable'
import {
  decodeVitalScalarValues,
  VITAL_BOUND_SETTING_KEYS,
  type VitalScalarPath,
} from './bindings'

export class VitalImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VitalImportError'
  }
}

export interface VitalImportResult {
  patch: PatchState
  warnings: string[]
  sourceVersion: string
}

export interface VitalImportOptions {
  sourceFilename?: string
}

const APP_AUTHOR = 'Wavetable Workbench'
const MAX_HARMONICS = 128
const HARMONIC_NOISE_FLOOR = 1e-5
const WAVEFORM_TOLERANCE = 3e-4

const TOP_LEVEL_MUTABLE_KEYS = new Set([
  'author',
  'comments',
  'preset_name',
  'preset_style',
  'settings',
  'synth_version',
])

const SUPPORTED_SETTING_KEYS = new Set([
  ...VITAL_BOUND_SETTING_KEYS,
  'filter_fx_model',
  'filter_fx_style',
  'filter_fx_blend',
  'effect_chain_order',
  'lfo_1_sync',
  'lfo_1_tempo',
  'lfo_1_frequency',
  'delay_sync',
  'delay_aux_sync',
  'delay_tempo',
  'delay_aux_tempo',
  'delay_frequency',
  'delay_aux_frequency',
  'wavetables',
  'lfos',
  'modulations',
])

const VITAL_STYLE_CATEGORIES: Record<string, PatchCategory> = {
  Pad: 'pad',
  Bass: 'bass',
  Lead: 'lead',
  Pluck: 'pluck',
  Keys: 'keys',
  Atmosphere: 'atmosphere',
  Sequence: 'rhythmic',
  Other: 'other',
}

const VITAL_TEMPO_DIVISIONS: Record<number, Exclude<LfoRate, { mode: 'free' }>['division']> = {
  6: '1/1',
  7: '1/2',
  8: '1/4',
  9: '1/8',
  10: '1/16',
  11: '1/32',
  12: '1/64',
}

const VITAL_TRIPLET_DIVISIONS: Partial<
  Record<number, Exclude<LfoRate, { mode: 'free' }>['division']>
> = {
  9: '1/8T',
  10: '1/16T',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new VitalImportError(`${label} must be an object`)
  return value
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new VitalImportError(`${label} must be an array`)
  return value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new VitalImportError(`${label} must be a string`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new VitalImportError(`${label} must be a finite number`)
  }
  return value
}

function integer(value: unknown, label: string): number {
  const parsed = finiteNumber(value, label)
  if (!Number.isInteger(parsed)) throw new VitalImportError(`${label} must be a whole number`)
  return parsed
}

function numericBoolean(value: unknown, label: string): boolean {
  const parsed = integer(value, label)
  if (parsed !== 0 && parsed !== 1) throw new VitalImportError(`${label} must be 0 or 1`)
  return parsed === 1
}

function setting(settings: Record<string, unknown>, key: string): number {
  if (!(key in settings)) throw new VitalImportError(`Vital settings is missing ${key}`)
  return finiteNumber(settings[key], `Vital setting ${key}`)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => valuesEqual(value, right[index]))
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]))
    )
  }
  return false
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  if (!valuesEqual(actual, sortedExpected)) {
    throw new VitalImportError(`${label} contains unsupported fields`)
  }
}

function assertDocumentEnvelope(
  value: unknown,
  template: VitalPresetDocument,
): asserts value is VitalPresetDocument {
  const document = record(value, 'Vital preset')
  const importedKeys = Object.keys(document).sort()
  const templateKeys = Object.keys(template).sort()
  if (!valuesEqual(importedKeys, templateKeys)) {
    throw new VitalImportError('Vital preset top-level structure does not match the pinned 1.0.7 fixture')
  }

  for (const key of templateKeys) {
    if (!TOP_LEVEL_MUTABLE_KEYS.has(key) && !valuesEqual(document[key], template[key])) {
      throw new VitalImportError(`Unsupported Vital top-level field changed: ${key}`)
    }
  }

  if (template.synth_version !== '1.0.7') {
    throw new VitalImportError('The loaded compatibility fixture is not pinned to Vital 1.0.7')
  }
  if (document.synth_version !== template.synth_version) {
    throw new VitalImportError(
      `Unsupported Vital version: ${String(document.synth_version)} (expected 1.0.7)`,
    )
  }

  for (const key of ['author', 'comments', 'preset_name', 'preset_style'] as const) {
    stringValue(document[key], `Vital ${key}`)
  }
  record(document.settings, 'Vital settings')
}

function assertUnsupportedSettingsUnchanged(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
): void {
  const importedKeys = Object.keys(settings).sort()
  const templateKeys = Object.keys(templateSettings).sort()
  if (!valuesEqual(importedKeys, templateKeys)) {
    throw new VitalImportError('Vital settings keys do not match the pinned 1.0.7 fixture')
  }

  const modulationSlots = array(templateSettings.modulations, 'Template modulation slots').length
  for (let slot = 1; slot <= modulationSlots; slot += 1) {
    for (const field of ['amount', 'bipolar', 'stereo', 'power', 'bypass']) {
      SUPPORTED_SETTING_KEYS.add(`modulation_${slot}_${field}`)
    }
  }

  for (const key of templateKeys) {
    if (!SUPPORTED_SETTING_KEYS.has(key) && !valuesEqual(settings[key], templateSettings[key])) {
      throw new VitalImportError(`Unsupported Vital setting changed: ${key}`)
    }
  }
}

function decodeBase64(value: unknown, label: string): Uint8Array {
  const encoded = stringValue(value, label)
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new VitalImportError(`${label} is not valid base64`)
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((encoded.length / 4) * 3 - padding)
  let outputIndex = 0

  for (let index = 0; index < encoded.length; index += 4) {
    const values = [0, 1, 2, 3].map((offset) => {
      const character = encoded[index + offset]
      if (character === '=') return 0
      const decoded = alphabet.indexOf(character)
      if (decoded < 0) throw new VitalImportError(`${label} is not valid base64`)
      return decoded
    })
    const chunk = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3]
    if (outputIndex < bytes.length) bytes[outputIndex++] = (chunk >> 16) & 0xff
    if (outputIndex < bytes.length) bytes[outputIndex++] = (chunk >> 8) & 0xff
    if (outputIndex < bytes.length) bytes[outputIndex++] = chunk & 0xff
  }

  return bytes
}

function decodeWaveSamples(value: unknown, label: string): Float32Array {
  const bytes = decodeBase64(value, label)
  const expectedLength = VITAL_FRAME_SAMPLE_COUNT * Float32Array.BYTES_PER_ELEMENT
  if (bytes.length !== expectedLength) {
    throw new VitalImportError(`${label} must decode to exactly ${expectedLength} bytes`)
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const samples = new Float32Array(VITAL_FRAME_SAMPLE_COUNT)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
    if (!Number.isFinite(sample)) throw new VitalImportError(`${label} contains a non-finite sample`)
    samples[index] = sample
  }
  return samples
}

function recoverHarmonics(samples: Float32Array, label: string): WavetableFrameState {
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length
  if (Math.abs(mean) > WAVEFORM_TOLERANCE) {
    throw new VitalImportError(`${label} contains unsupported DC offset`)
  }

  const magnitudes: number[] = []
  const phases: number[] = []
  for (let harmonic = 1; harmonic <= MAX_HARMONICS; harmonic += 1) {
    const angle = (-2 * Math.PI * harmonic) / samples.length
    const cosineStep = Math.cos(angle)
    const sineStep = Math.sin(angle)
    let cosine = 1
    let sine = 0
    let real = 0
    let imaginary = 0

    for (const sample of samples) {
      real += sample * cosine
      imaginary += sample * sine
      const nextCosine = cosine * cosineStep - sine * sineStep
      sine = sine * cosineStep + cosine * sineStep
      cosine = nextCosine
    }
    magnitudes.push((2 * Math.hypot(real, imaginary)) / samples.length)
    phases.push(Math.atan2(real, -imaginary))
  }

  const maximum = Math.max(...magnitudes)
  let harmonicCount = 1
  if (maximum >= HARMONIC_NOISE_FLOOR) {
    let bestScore = Number.POSITIVE_INFINITY
    for (let candidate = 1; candidate <= MAX_HARMONICS; candidate += 1) {
      let phaseScore = 0
      let phaseWeight = 0
      let tailScore = 0
      magnitudes.forEach((magnitude, index) => {
        const harmonic = index + 1
        const weight = magnitude / maximum
        if (harmonic > candidate) {
          tailScore += weight
          return
        }
        if (weight < HARMONIC_NOISE_FLOOR) return
        const expectedPhase = (-Math.PI * harmonic * (harmonic + 1)) / candidate
        const phaseDifference = Math.atan2(
          Math.sin(phases[index] - expectedPhase),
          Math.cos(phases[index] - expectedPhase),
        )
        phaseScore += Math.abs(phaseDifference) * weight
        phaseWeight += weight
      })
      const score = phaseScore / Math.max(phaseWeight, HARMONIC_NOISE_FLOOR) + tailScore * 4
      if (score < bestScore) {
        bestScore = score
        harmonicCount = candidate
      }
    }
  }

  const retainedMagnitudes = magnitudes.slice(0, harmonicCount)
  const harmonics =
    maximum < HARMONIC_NOISE_FLOOR
      ? [0]
      : retainedMagnitudes.map((magnitude) => {
          const normalized = magnitude / maximum
          return normalized < HARMONIC_NOISE_FLOOR ? 0 : Math.min(1, normalized)
        })

  const frame = { harmonics }
  const canonical = renderWavetableFrame(frame)
  let maximumError = 0
  for (let index = 0; index < samples.length; index += 1) {
    maximumError = Math.max(maximumError, Math.abs(samples[index] - canonical[index]))
  }
  if (maximumError > WAVEFORM_TOLERANCE) {
    throw new VitalImportError(
      `${label} uses waveform phase or material that PatchState cannot represent`,
    )
  }
  return frame
}

function safeWavetableId(name: string, slot: number): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 44)
  return `vital-osc-${slot}-${slug || 'wavetable'}`
}

function parseWavetable(value: unknown, slot: number, version: string): WavetableState {
  const table = record(value, `Vital wavetable ${slot}`)
  assertExactKeys(
    table,
    ['author', 'full_normalize', 'groups', 'name', 'remove_all_dc', 'version'],
    `Vital wavetable ${slot}`,
  )
  if (table.full_normalize !== true || table.remove_all_dc !== true) {
    throw new VitalImportError(`Vital wavetable ${slot} must normalize and remove DC`)
  }
  if (stringValue(table.version, `Vital wavetable ${slot} version`) !== version) {
    throw new VitalImportError(`Vital wavetable ${slot} version does not match the preset`)
  }
  stringValue(table.author, `Vital wavetable ${slot} author`)
  const name = stringValue(table.name, `Vital wavetable ${slot} name`).trim()
  if (name.length < 1 || name.length > 80) {
    throw new VitalImportError(`Vital wavetable ${slot} name must contain 1 to 80 characters`)
  }

  const groups = array(table.groups, `Vital wavetable ${slot} groups`)
  if (groups.length !== 1) {
    throw new VitalImportError(`Vital wavetable ${slot} must contain exactly one generated group`)
  }
  const group = record(groups[0], `Vital wavetable ${slot} group`)
  assertExactKeys(group, ['components'], `Vital wavetable ${slot} group`)
  const components = array(group.components, `Vital wavetable ${slot} components`)
  if (components.length !== 1) {
    throw new VitalImportError(`Vital wavetable ${slot} must contain exactly one Wave Source`)
  }
  const component = record(components[0], `Vital wavetable ${slot} component`)
  assertExactKeys(
    component,
    ['interpolation', 'interpolation_style', 'keyframes', 'type'],
    `Vital wavetable ${slot} component`,
  )
  if (
    component.type !== 'Wave Source' ||
    component.interpolation !== 1 ||
    component.interpolation_style !== 1
  ) {
    throw new VitalImportError(`Vital wavetable ${slot} uses an unsupported source or interpolation`)
  }

  for (const generated of Object.values(WAVETABLE_REGISTRY)) {
    if (valuesEqual(table, buildVitalWavetable(generated, version))) {
      return structuredClone(generated)
    }
  }

  const keyframes = array(component.keyframes, `Vital wavetable ${slot} keyframes`)
  if (keyframes.length < 1 || keyframes.length > 64) {
    throw new VitalImportError(`Vital wavetable ${slot} must contain 1 to 64 keyframes`)
  }
  const denominator = Math.max(1, keyframes.length - 1)
  const frames = keyframes.map((keyframeValue, index) => {
    const keyframe = record(keyframeValue, `Vital wavetable ${slot} keyframe ${index + 1}`)
    assertExactKeys(
      keyframe,
      ['position', 'wave_data'],
      `Vital wavetable ${slot} keyframe ${index + 1}`,
    )
    const expectedPosition = keyframes.length === 1 ? 0 : Math.round((index * 256) / denominator)
    if (integer(keyframe.position, `Vital wavetable ${slot} keyframe position`) !== expectedPosition) {
      throw new VitalImportError(
        `Vital wavetable ${slot} uses non-uniform keyframe positions that PatchState cannot represent`,
      )
    }
    return recoverHarmonics(
      decodeWaveSamples(
        keyframe.wave_data,
        `Vital wavetable ${slot} keyframe ${index + 1} wave_data`,
      ),
      `Vital wavetable ${slot} keyframe ${index + 1}`,
    )
  })

  return { id: safeWavetableId(name, slot), name, frames }
}

type DecodedVitalScalars = Record<VitalScalarPath, unknown>

function scalar<T>(values: DecodedVitalScalars, path: VitalScalarPath): T {
  return values[path] as T
}

function parseEnvelope(values: DecodedVitalScalars, prefix: 'ampEnvelope' | 'modEnvelope'): EnvelopeState {
  return {
    delaySeconds: scalar(values, `${prefix}.delaySeconds`),
    attackSeconds: scalar(values, `${prefix}.attackSeconds`),
    holdSeconds: scalar(values, `${prefix}.holdSeconds`),
    decaySeconds: scalar(values, `${prefix}.decaySeconds`),
    sustainLevel: scalar(values, `${prefix}.sustainLevel`),
    releaseSeconds: scalar(values, `${prefix}.releaseSeconds`),
    attackCurve: scalar(values, `${prefix}.attackCurve`),
    decayCurve: scalar(values, `${prefix}.decayCurve`),
    releaseCurve: scalar(values, `${prefix}.releaseCurve`),
  }
}

function parseOscillator(
  settings: Record<string, unknown>,
  values: DecodedVitalScalars,
  index: 1 | 2 | 3,
  wavetableId: string,
): OscillatorState {
  const prefix = `osc_${index}`
  const logicalIndex = (index - 1) as 0 | 1 | 2
  const oscillatorScalar = <T>(field: Exclude<keyof OscillatorState, 'wavetableId'>): T =>
    scalar(values, `oscillators.${logicalIndex}.${field}` as VitalScalarPath)
  if (setting(settings, `${prefix}_destination`) !== 3) {
    throw new VitalImportError(`Oscillator ${index} must route to Vital's effects input`)
  }
  return {
    enabled: oscillatorScalar('enabled'),
    wavetableId,
    wavetablePosition: oscillatorScalar('wavetablePosition'),
    level: oscillatorScalar('level'),
    transposeSemitones: oscillatorScalar('transposeSemitones'),
    fineTuneCents: oscillatorScalar('fineTuneCents'),
    unisonVoices: oscillatorScalar('unisonVoices'),
    unisonDetune: oscillatorScalar('unisonDetune'),
    stereoSpread: oscillatorScalar('stereoSpread'),
    randomPhase: oscillatorScalar('randomPhase'),
    pan: oscillatorScalar('pan'),
  }
}

function parseRate(settings: Record<string, unknown>): LfoRate {
  if (setting(settings, 'lfo_1_sync_type') !== 0) {
    throw new VitalImportError('LFO 1 uses an unsupported sync type')
  }
  const sync = integer(setting(settings, 'lfo_1_sync'), 'lfo_1_sync')
  if (sync === 0) return { mode: 'free', hz: 2 ** setting(settings, 'lfo_1_frequency') }
  const tempo = integer(setting(settings, 'lfo_1_tempo'), 'lfo_1_tempo')
  const division = sync === 1 ? VITAL_TEMPO_DIVISIONS[tempo] : VITAL_TRIPLET_DIVISIONS[tempo]
  if ((sync !== 1 && sync !== 3) || !division) {
    throw new VitalImportError('LFO 1 uses an unsupported synchronized rate')
  }
  return { mode: 'sync', division }
}

function parseLfo(
  value: unknown,
  settings: Record<string, unknown>,
  enabled: boolean,
  scalars: DecodedVitalScalars,
): LfoState {
  const lfo = record(value, 'Vital LFO 1')
  assertExactKeys(lfo, ['name', 'num_points', 'points', 'powers', 'smooth'], 'Vital LFO 1')
  stringValue(lfo.name, 'Vital LFO 1 name')
  const pointCount = integer(lfo.num_points, 'Vital LFO 1 num_points')
  if (pointCount < 2 || pointCount > 32) {
    throw new VitalImportError('Vital LFO 1 must contain 2 to 32 points')
  }
  const pointValues = array(lfo.points, 'Vital LFO 1 points')
  const powers = array(lfo.powers, 'Vital LFO 1 powers')
  if (pointValues.length !== pointCount * 2 || powers.length !== pointCount) {
    throw new VitalImportError('Vital LFO 1 point arrays do not match num_points')
  }
  if (typeof lfo.smooth !== 'boolean') throw new VitalImportError('Vital LFO 1 smooth must be boolean')
  return {
    enabled,
    points: Array.from({ length: pointCount }, (_, index) => ({
      x: finiteNumber(pointValues[index * 2], `Vital LFO 1 point ${index + 1} x`),
      y: decodeVitalLfoPointValue(
        finiteNumber(pointValues[index * 2 + 1], `Vital LFO 1 point ${index + 1} y`),
      ),
      power: finiteNumber(powers[index], `Vital LFO 1 point ${index + 1} power`),
    })),
    rate: parseRate(settings),
    phase: scalar(scalars, 'lfo1.phase'),
    smooth: lfo.smooth,
    smoothing: scalar(scalars, 'lfo1.smoothing'),
  }
}

function reverseLookup<T extends string>(
  mapping: Record<T, string>,
  value: string,
): T | undefined {
  return (Object.entries(mapping) as Array<[T, string]>).find(([, mapped]) => mapped === value)?.[0]
}

function parseModulations(
  settings: Record<string, unknown>,
  values: unknown[],
): { routes: ModulationRoute[]; lfoEnabled: boolean } {
  const routes: ModulationRoute[] = []
  const lfoBypasses: boolean[] = []

  values.forEach((value, index) => {
    const slot = index + 1
    const route = record(value, `Vital modulation slot ${slot}`)
    assertExactKeys(route, ['destination', 'source'], `Vital modulation slot ${slot}`)
    const sourceValue = stringValue(route.source, `Vital modulation slot ${slot} source`)
    const destinationValue = stringValue(
      route.destination,
      `Vital modulation slot ${slot} destination`,
    )
    const amount = setting(settings, `modulation_${slot}_amount`)
    const bipolar = numericBoolean(
      setting(settings, `modulation_${slot}_bipolar`),
      `modulation_${slot}_bipolar`,
    )
    const stereo = setting(settings, `modulation_${slot}_stereo`)
    const power = setting(settings, `modulation_${slot}_power`)
    const bypass = numericBoolean(
      setting(settings, `modulation_${slot}_bypass`),
      `modulation_${slot}_bypass`,
    )

    if (sourceValue === '' && destinationValue === '') {
      if (amount !== 0 || bipolar || stereo !== 0 || power !== 0 || bypass) {
        throw new VitalImportError(`Unused Vital modulation slot ${slot} contains unsupported state`)
      }
      return
    }
    if (sourceValue === '' || destinationValue === '') {
      throw new VitalImportError(`Vital modulation slot ${slot} is incomplete`)
    }
    if (stereo !== 0 || power !== 0) {
      throw new VitalImportError(`Vital modulation slot ${slot} uses unsupported stereo or power`)
    }

    const source = reverseLookup(VITAL_MODULATION_SOURCES, sourceValue) as
      | ModulationSource
      | undefined
    const destination = reverseLookup(VITAL_MODULATION_DESTINATIONS, destinationValue) as
      | ModulationDestination
      | undefined
    if (!source || !destination) {
      throw new VitalImportError(
        `Unsupported Vital modulation route in slot ${slot}: ${sourceValue} -> ${destinationValue}`,
      )
    }
    if (source === 'modEnvelope' && bypass) {
      throw new VitalImportError(`ENV 2 route ${slot} is bypassed and cannot be represented`)
    }
    if (source === 'lfo1') lfoBypasses.push(bypass)
    routes.push({
      id: `vital-route-${slot}`,
      source,
      destination,
      amount,
      bipolar,
    })
  })

  if (new Set(lfoBypasses).size > 1) {
    throw new VitalImportError('LFO 1 routes mix enabled and bypassed state')
  }
  return {
    routes,
    lfoEnabled: lfoBypasses.length > 0 ? !lfoBypasses[0] : false,
  }
}

function decodeFilterCutoff(value: number): number {
  return Math.round(440 * 2 ** ((value - 69) / 12))
}

function parseFxFilterType(settings: Record<string, unknown>) {
  try {
    return decodeVitalFxFilterType({
      model: integer(setting(settings, 'filter_fx_model'), 'filter_fx_model'),
      style: integer(setting(settings, 'filter_fx_style'), 'filter_fx_style'),
      blend: setting(settings, 'filter_fx_blend'),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unsupported mapping'
    throw new VitalImportError(detail)
  }
}

function parseEffectOrder(settings: Record<string, unknown>): EffectId[] {
  try {
    return decodeVitalEffectOrder(
      integer(setting(settings, 'effect_chain_order'), 'effect_chain_order'),
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unsupported encoding'
    throw new VitalImportError(detail)
  }
}

function parseDelayDivision(sync: number, tempo: number): TempoSyncDivision {
  const division = sync === 1 ? VITAL_TEMPO_DIVISIONS[tempo] : VITAL_TRIPLET_DIVISIONS[tempo]
  if ((sync !== 1 && sync !== 3) || !division) {
    throw new VitalImportError('Delay uses an unsupported synchronized rate')
  }
  return division
}

function parsePatch(document: VitalPresetDocument, template: VitalPresetDocument): PatchState {
  const settings = record(document.settings, 'Vital settings')
  const templateSettings = record(template.settings, 'Template Vital settings')
  assertUnsupportedSettingsUnchanged(settings, templateSettings)
  const scalars = decodeVitalScalarValues(settings)

  if (setting(settings, 'filter_1_on') !== 0 || setting(settings, 'filter_2_on') !== 0) {
    throw new VitalImportError('Filter 1 and Filter 2 must be off for PatchState compatibility')
  }
  if (setting(settings, 'filter_fx_mix') !== 1) {
    throw new VitalImportError('Vital FX filter mix must be fully wet for PatchState compatibility')
  }

  const importedWavetables = array(settings.wavetables, 'Vital wavetables')
  const templateWavetables = array(templateSettings.wavetables, 'Template Vital wavetables')
  if (importedWavetables.length !== templateWavetables.length || importedWavetables.length < 3) {
    throw new VitalImportError('Vital preset must retain the pinned wavetable slot count')
  }
  for (let index = 3; index < importedWavetables.length; index += 1) {
    if (!valuesEqual(importedWavetables[index], templateWavetables[index])) {
      throw new VitalImportError(`Unsupported Vital wavetable slot ${index + 1} contains material`)
    }
  }
  const firstWavetable = parseWavetable(importedWavetables[0], 1, document.synth_version)
  const secondWavetable = parseWavetable(importedWavetables[1], 2, document.synth_version)
  const thirdWavetable = parseWavetable(importedWavetables[2], 3, document.synth_version)
  const wavetableData = Object.fromEntries(
    [firstWavetable, secondWavetable, thirdWavetable].map((wavetable) => [wavetable.id, wavetable]),
  )

  const modulationValues = array(settings.modulations, 'Vital modulation slots')
  const templateModulations = array(templateSettings.modulations, 'Template modulation slots')
  if (modulationValues.length !== templateModulations.length) {
    throw new VitalImportError('Vital preset must retain the pinned modulation slot count')
  }
  const modulation = parseModulations(settings, modulationValues)

  const importedLfos = array(settings.lfos, 'Vital LFO slots')
  const templateLfos = array(templateSettings.lfos, 'Template Vital LFO slots')
  if (importedLfos.length !== templateLfos.length || importedLfos.length < 1) {
    throw new VitalImportError('Vital preset must retain the pinned LFO slot count')
  }
  for (let index = 1; index < importedLfos.length; index += 1) {
    if (!valuesEqual(importedLfos[index], templateLfos[index])) {
      throw new VitalImportError(`Unsupported Vital LFO slot ${index + 1} contains material`)
    }
  }

  const style = stringValue(document.preset_style, 'Vital preset_style')
  const category = VITAL_STYLE_CATEGORIES[style]
  if (!category) throw new VitalImportError(`Unsupported Vital preset style: ${style || '(empty)'}`)
  const name = stringValue(document.preset_name, 'Vital preset_name').trim()
  const comments = stringValue(document.comments, 'Vital comments').trim()
  const delaySync = integer(setting(settings, 'delay_sync'), 'delay_sync')
  const delayAuxSync = integer(setting(settings, 'delay_aux_sync'), 'delay_aux_sync')
  const delayTempo = integer(setting(settings, 'delay_tempo'), 'delay_tempo')
  const delayAuxTempo = integer(setting(settings, 'delay_aux_tempo'), 'delay_aux_tempo')
  const delayFrequency = setting(settings, 'delay_frequency')
  const delayAuxFrequency = setting(settings, 'delay_aux_frequency')
  if (
    delaySync !== delayAuxSync ||
    delayTempo !== delayAuxTempo ||
    delayFrequency !== delayAuxFrequency
  ) {
    throw new VitalImportError('Vital left/right delay timing must use the same supported values')
  }

  const delayMode = delaySync === 0 ? 'free' : 'sync'
  const patchCandidate = {
    version: 3,
    metadata: {
      name,
      category,
      ...(comments ? { description: comments } : {}),
      tags: ['vital-import'],
    },
    oscillators: [
      parseOscillator(settings, scalars, 1, firstWavetable.id),
      parseOscillator(settings, scalars, 2, secondWavetable.id),
      parseOscillator(settings, scalars, 3, thirdWavetable.id),
    ],
    ampEnvelope: parseEnvelope(scalars, 'ampEnvelope'),
    modEnvelope: parseEnvelope(scalars, 'modEnvelope'),
    filter: {
      enabled: scalar(scalars, 'filter.enabled'),
      ...parseFxFilterType(settings),
      cutoffHz: scalar(scalars, 'filter.cutoffHz'),
      resonance: scalar(scalars, 'filter.resonance'),
      drive: scalar(scalars, 'filter.drive'),
      keytrack: scalar(scalars, 'filter.keytrack'),
    },
    lfo1: parseLfo(importedLfos[0], settings, modulation.lfoEnabled, scalars),
    modulations: modulation.routes,
    voice: {
      polyphony: scalar(scalars, 'voice.polyphony'),
      legato: scalar(scalars, 'voice.legato'),
      glideSeconds: scalar(scalars, 'voice.glideSeconds'),
      velocitySensitivity: scalar(scalars, 'voice.velocitySensitivity'),
      transposeSemitones: scalar(scalars, 'voice.transposeSemitones'),
    },
    effects: {
      order: parseEffectOrder(settings),
      distortion: {
        enabled: scalar(scalars, 'effects.distortion.enabled'),
        type: scalar(scalars, 'effects.distortion.type'),
        drive: scalar(scalars, 'effects.distortion.drive'),
        mix: scalar(scalars, 'effects.distortion.mix'),
      },
      chorus: {
        enabled: scalar(scalars, 'effects.chorus.enabled'),
        voices: scalar(scalars, 'effects.chorus.voices'),
        rate: scalar(scalars, 'effects.chorus.rate'),
        depth: scalar(scalars, 'effects.chorus.depth'),
        feedback: scalar(scalars, 'effects.chorus.feedback'),
        mix: scalar(scalars, 'effects.chorus.mix'),
      },
      delay: {
        enabled: scalar(scalars, 'effects.delay.enabled'),
        mode: delayMode,
        ...(delayMode === 'sync'
          ? { division: parseDelayDivision(delaySync, delayTempo) }
          : { timeSeconds: decodeVitalDelaySeconds(delayFrequency) }),
        ...(delayMode === 'sync'
          ? { timeSeconds: decodeVitalDelaySeconds(delayFrequency) }
          : {}),
        feedback: scalar(scalars, 'effects.delay.feedback'),
        mix: scalar(scalars, 'effects.delay.mix'),
      },
      reverb: {
        enabled: scalar(scalars, 'effects.reverb.enabled'),
        mix: scalar(scalars, 'effects.reverb.mix'),
        decaySeconds: scalar(scalars, 'effects.reverb.decaySeconds'),
        size: scalar(scalars, 'effects.reverb.size'),
        predelay: scalar(scalars, 'effects.reverb.predelay'),
        lowCut: scalar(scalars, 'effects.reverb.lowCut'),
        highCut: scalar(scalars, 'effects.reverb.highCut'),
      },
    },
    wavetableData,
  }

  try {
    return parsePatchState(patchCandidate)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown schema error'
    throw new VitalImportError(`Vital preset is outside PatchState bounds: ${detail}`)
  }
}

interface LossyVitalRoute {
  slot: number
  source: string
  destination: string
  amount: number
  bipolar: boolean
  bypass: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function warnOnce(warnings: Set<string>, message: string): void {
  warnings.add(message)
}

function lossySetting(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  key: string,
  warnings: Set<string>,
): number {
  const value = settings[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const fallback = templateSettings[key]
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    warnOnce(warnings, `Missing or invalid ${key}; the Init value was substituted.`)
    return fallback
  }
  throw new VitalImportError(`Vital settings is missing numeric ${key}`)
}

function lossyBoolean(value: number): boolean {
  return value >= 0.5
}

function parseLossyEffectOrder(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  warnings: Set<string>,
): EffectId[] {
  const raw = lossySetting(settings, templateSettings, 'effect_chain_order', warnings)
  const normalized = clamp(Math.round(raw), 0, VITAL_EFFECT_ORDER_MAX)
  if (normalized !== raw) {
    warnOnce(warnings, 'The effect-chain order encoding was rounded into Vital’s supported range.')
  }
  try {
    return decodeVitalEffectOrder(normalized)
  } catch {
    warnOnce(warnings, 'The effect-chain order could not be decoded; the workbench order was used.')
    return [...DEFAULT_EFFECT_ORDER]
  }
}

function parseLossyFxFilterType(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  prefix: 'filter_1' | 'filter_fx',
  warnings: Set<string>,
): FilterType {
  const values = {
    model: lossySetting(settings, templateSettings, `${prefix}_model`, warnings),
    style: lossySetting(settings, templateSettings, `${prefix}_style`, warnings),
    blend: lossySetting(settings, templateSettings, `${prefix}_blend`, warnings),
  }
  try {
    return decodeVitalFxFilterType(values).type
  } catch {
    warnOnce(warnings, 'The original filter model was mapped to the workbench low-pass filter.')
    return 'lowpass'
  }
}

function filenamePresetName(filename: string | undefined): string | undefined {
  if (!filename) return undefined
  const basename = filename.split(/[\\/]/).pop()?.replace(/\.vital$/i, '').trim()
  return basename ? basename.slice(0, 80) : undefined
}

function readLossyRoutes(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  warnings: Set<string>,
): LossyVitalRoute[] {
  if (!Array.isArray(settings.modulations)) {
    throw new VitalImportError('Vital settings has no modulation slots')
  }

  const routes: LossyVitalRoute[] = []
  settings.modulations.forEach((value, index) => {
    if (!isRecord(value)) {
      warnOnce(warnings, 'Malformed modulation slots were ignored.')
      return
    }
    const source = typeof value.source === 'string' ? value.source : ''
    const destination = typeof value.destination === 'string' ? value.destination : ''
    if (!source && !destination) return
    if (!source || !destination) {
      warnOnce(warnings, 'Incomplete modulation routes were ignored.')
      return
    }
    const slot = index + 1
    routes.push({
      slot,
      source,
      destination,
      amount: lossySetting(settings, templateSettings, `modulation_${slot}_amount`, warnings),
      bipolar: lossyBoolean(
        lossySetting(settings, templateSettings, `modulation_${slot}_bipolar`, warnings),
      ),
      bypass: lossyBoolean(
        lossySetting(settings, templateSettings, `modulation_${slot}_bypass`, warnings),
      ),
    })
  })
  return routes
}

function macroContribution(
  routes: readonly LossyVitalRoute[],
  settings: Record<string, unknown>,
  destination: string,
): number {
  return routes.reduce((total, route) => {
    if (route.bypass || route.destination !== destination || !/^macro_control_[1-4]$/.test(route.source)) {
      return total
    }
    const macro = settings[route.source]
    return typeof macro === 'number' && Number.isFinite(macro)
      ? total + route.amount * clamp(macro, 0, 1)
      : total
  }, 0)
}

function recoverMagnitudeHarmonics(samples: Float32Array): WavetableFrameState {
  const magnitudes: number[] = []
  for (let harmonic = 1; harmonic <= MAX_HARMONICS; harmonic += 1) {
    let real = 0
    let imaginary = 0
    for (let index = 0; index < samples.length; index += 1) {
      const angle = (-2 * Math.PI * harmonic * index) / samples.length
      real += samples[index] * Math.cos(angle)
      imaginary += samples[index] * Math.sin(angle)
    }
    magnitudes.push(Math.hypot(real, imaginary))
  }

  const maximum = Math.max(...magnitudes)
  if (maximum < HARMONIC_NOISE_FLOOR) return { harmonics: [0] }
  const normalized = magnitudes.map((magnitude) => {
    const value = magnitude / maximum
    return value < HARMONIC_NOISE_FLOOR ? 0 : Math.min(1, value)
  })
  let length = normalized.length
  while (length > 1 && normalized[length - 1] === 0) length -= 1
  return { harmonics: normalized.slice(0, length) }
}

function decodePcm16(value: unknown, label: string): Int16Array {
  const bytes = decodeBase64(value, label)
  if (bytes.length < 2 || bytes.length % 2 !== 0) {
    throw new VitalImportError(`${label} must contain little-endian 16-bit PCM`)
  }
  const samples = new Int16Array(bytes.length / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true)
  }
  return samples
}

function resampleAudioWindow(
  samples: Int16Array,
  startPosition: number,
  windowSize: number,
): Float32Array {
  const output = new Float32Array(VITAL_FRAME_SAMPLE_COUNT)
  const start = clamp(startPosition, 0, Math.max(0, samples.length - 1))
  const size = clamp(windowSize, 1, samples.length)
  for (let index = 0; index < output.length; index += 1) {
    const position = start + (index * size) / output.length
    const left = Math.min(samples.length - 1, Math.floor(position))
    const right = Math.min(samples.length - 1, left + 1)
    const fraction = position - left
    output[index] = (samples[left] * (1 - fraction) + samples[right] * fraction) / 32768
  }
  return output
}

function fallbackWavetable(name: string, warnings: Set<string>): WavetableState {
  const normalized = name.toLowerCase()
  const id = normalized.includes('sine')
    ? 'sine'
    : normalized.includes('triangle')
      ? 'triangle'
      : normalized.includes('square')
        ? 'soft-square'
        : normalized.includes('saw')
          ? 'saw'
          : 'digital'
  warnOnce(warnings, `Wavetable “${name}” could not be flattened; ${WAVETABLE_REGISTRY[id].name} was substituted.`)
  return structuredClone(WAVETABLE_REGISTRY[id])
}

function parseLossyWavetable(
  value: unknown,
  slot: number,
  warnings: Set<string>,
): WavetableState {
  if (!isRecord(value)) return fallbackWavetable(`Oscillator ${slot}`, warnings)
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim().slice(0, 80)
    : `Imported oscillator ${slot}`
  if (!Array.isArray(value.groups) || value.groups.length < 1) {
    return fallbackWavetable(name, warnings)
  }

  const components = value.groups.flatMap((group) =>
    isRecord(group) && Array.isArray(group.components) ? group.components : [],
  )
  const component = components.find(
    (candidate) =>
      isRecord(candidate) &&
      (candidate.type === 'Wave Source' || candidate.type === 'Audio File Source'),
  )
  if (!isRecord(component) || typeof component.type !== 'string') {
    return fallbackWavetable(name, warnings)
  }

  let frames: WavetableFrameState[]
  if (component.type === 'Wave Source') {
    if (!Array.isArray(component.keyframes) || component.keyframes.length < 1) {
      throw new VitalImportError(`Vital wavetable ${slot} Wave Source has no keyframes`)
    }
    frames = component.keyframes.slice(0, 64).map((keyframe, index) => {
      if (!isRecord(keyframe)) {
        throw new VitalImportError(`Vital wavetable ${slot} keyframe ${index + 1} must be an object`)
      }
      return recoverMagnitudeHarmonics(
        decodeWaveSamples(
          keyframe.wave_data,
          `Vital wavetable ${slot} keyframe ${index + 1} wave_data`,
        ),
      )
    })
  } else {
    if (!Array.isArray(component.keyframes) || component.keyframes.length < 1) {
      throw new VitalImportError(`Vital wavetable ${slot} Audio File Source has no keyframes`)
    }
    const audio = decodePcm16(component.audio_file, `Vital wavetable ${slot} audio_file`)
    frames = component.keyframes.slice(0, 64).map((keyframe, index) => {
      if (!isRecord(keyframe)) {
        throw new VitalImportError(`Vital wavetable ${slot} keyframe ${index + 1} must be an object`)
      }
      return recoverMagnitudeHarmonics(
        resampleAudioWindow(
          audio,
          finiteNumber(keyframe.start_position, `Vital wavetable ${slot} start_position`),
          finiteNumber(keyframe.window_size, `Vital wavetable ${slot} window_size`),
        ),
      )
    })
    warnOnce(warnings, `Audio File Source wavetable “${name}” was reduced to harmonic frames.`)
  }

  const omittedTransforms = components
    .filter((candidate) => candidate !== component && isRecord(candidate) && typeof candidate.type === 'string')
    .map((candidate) => (candidate as Record<string, unknown>).type as string)
  if (omittedTransforms.length > 0) {
    warnOnce(
      warnings,
      `Wavetable transforms were omitted: ${[...new Set(omittedTransforms)].join(', ')}.`,
    )
  }
  if (value.groups.length > 1) {
    warnOnce(warnings, 'Only the first usable source across each wavetable’s groups was imported.')
  }
  return { id: safeWavetableId(name, slot), name, frames }
}

function parseLossyEnvelope(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  prefix: 'env_1' | 'env_2',
  warnings: Set<string>,
): EnvelopeState {
  const decode = (field: 'attack' | 'hold' | 'decay' | 'release', maximum: number) => {
    const seconds = decodeVitalEnvelopeSeconds(
      Math.max(0, lossySetting(settings, templateSettings, `${prefix}_${field}`, warnings)),
    )
    if (seconds > maximum) warnOnce(warnings, 'Envelope times outside workbench bounds were clamped.')
    return clamp(seconds, 0, maximum)
  }
  return {
    delaySeconds: 0,
    attackSeconds: decode('attack', 10),
    holdSeconds: decode('hold', ENVELOPE_HOLD_MAX_SECONDS),
    decaySeconds: decode('decay', 10),
    sustainLevel: clamp(
      lossySetting(settings, templateSettings, `${prefix}_sustain`, warnings),
      0,
      1,
    ),
    releaseSeconds: decode('release', 20),
    attackCurve: 0,
    decayCurve: -0.1,
    releaseCurve: -0.1,
  }
}

function parseLossyOscillator(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  routes: readonly LossyVitalRoute[],
  index: 1 | 2 | 3,
  wavetableId: string,
  warnings: Set<string>,
): OscillatorState {
  const prefix = `osc_${index}`
  const enabled = lossyBoolean(lossySetting(settings, templateSettings, `${prefix}_on`, warnings))
  const destination = lossySetting(settings, templateSettings, `${prefix}_destination`, warnings)
  if (destination !== 3) {
    warnOnce(warnings, 'Oscillator routing outside the effects input was collapsed into the workbench signal path.')
  }

  let rawLevel =
    lossySetting(settings, templateSettings, `${prefix}_level`, warnings) +
    macroContribution(routes, settings, `${prefix}_level`)
  if (enabled && rawLevel <= 1e-6) {
    const drivenLevel = routes
      .filter(
        (route) =>
          !route.bypass &&
          route.destination === `${prefix}_level` &&
          !/^macro_control_[1-4]$/.test(route.source),
      )
      .reduce((maximum, route) => Math.max(maximum, Math.abs(route.amount)), 0)
    if (drivenLevel > 0) {
      rawLevel = Math.min(Math.SQRT1_2, drivenLevel)
      warnOnce(warnings, 'Unsupported oscillator-level modulation was baked into a nominal audible level.')
    }
  }
  const clampedLevel = clamp(rawLevel, 0, Math.SQRT1_2)
  if (clampedLevel !== rawLevel) {
    warnOnce(warnings, 'Oscillator levels above the workbench range were clamped.')
  }

  const transpose = Math.round(
    lossySetting(settings, templateSettings, `${prefix}_transpose`, warnings),
  )
  if (transpose < -24 || transpose > 24) {
    warnOnce(warnings, 'Oscillator transposition outside ±24 semitones was clamped.')
  }
  return {
    enabled,
    wavetableId,
    wavetablePosition: clamp(
      lossySetting(settings, templateSettings, `${prefix}_wave_frame`, warnings) / 256 +
        macroContribution(routes, settings, `${prefix}_wave_frame`),
      0,
      1,
    ),
    level: clamp(clampedLevel ** 2 * 2, 0, 1),
    transposeSemitones: clamp(transpose, -24, 24),
    fineTuneCents: clamp(
      lossySetting(settings, templateSettings, `${prefix}_tune`, warnings) * 100,
      -100,
      100,
    ),
    unisonVoices: clamp(
      Math.round(lossySetting(settings, templateSettings, `${prefix}_unison_voices`, warnings)),
      1,
      8,
    ),
    unisonDetune: clamp(
      lossySetting(settings, templateSettings, `${prefix}_unison_detune`, warnings) ** 2 / 12,
      0,
      1,
    ),
    stereoSpread: clamp(
      lossySetting(settings, templateSettings, `${prefix}_stereo_spread`, warnings),
      0,
      1,
    ),
    randomPhase: clamp(
      lossySetting(settings, templateSettings, `${prefix}_random_phase`, warnings),
      0,
      1,
    ),
    pan: 0.5,
  }
}

function parseLossyModulations(
  routes: readonly LossyVitalRoute[],
  warnings: Set<string>,
): { routes: ModulationRoute[]; lfoEnabled: boolean } {
  const sourceMap: Record<string, ModulationSource | undefined> = {
    lfo_1: 'lfo1',
    env_2: 'modEnvelope',
  }
  const destinationMap: Record<string, ModulationDestination | undefined> = {
    osc_1_level: 'oscillator1.level',
    osc_1_wave_frame: 'oscillator1.wavetablePosition',
    osc_1_tune: 'oscillator1.pitch',
    osc_1_transpose: 'oscillator1.pitch',
    osc_2_level: 'oscillator2.level',
    osc_2_wave_frame: 'oscillator2.wavetablePosition',
    osc_2_tune: 'oscillator2.pitch',
    osc_2_transpose: 'oscillator2.pitch',
    osc_3_level: 'oscillator3.level',
    osc_3_wave_frame: 'oscillator3.wavetablePosition',
    osc_3_tune: 'oscillator3.pitch',
    osc_3_transpose: 'oscillator3.pitch',
    filter_1_cutoff: 'filter.cutoff',
    filter_fx_cutoff: 'filter.cutoff',
  }
  const imported: ModulationRoute[] = []
  const pairs = new Set<string>()
  let dropped = 0
  let mappedTranspose = false

  for (const route of routes) {
    if (route.bypass || /^macro_control_[1-4]$/.test(route.source)) continue
    const source = sourceMap[route.source]
    const destination = destinationMap[route.destination]
    if (!source || !destination) {
      dropped += 1
      continue
    }
    const pair = `${source}:${destination}`
    if (pairs.has(pair)) {
      dropped += 1
      continue
    }
    pairs.add(pair)
    mappedTranspose ||= route.destination.endsWith('_transpose')
    imported.push({
      id: `vital-route-${route.slot}`,
      source,
      destination,
      amount: clamp(route.amount, -1, 1),
      bipolar: route.bipolar,
    })
  }
  if (dropped > 0) warnOnce(warnings, `${dropped} unsupported modulation route(s) were omitted.`)
  if (mappedTranspose) {
    warnOnce(warnings, 'Transpose modulation was mapped to the workbench’s narrower pitch range.')
  }
  return {
    routes: imported,
    lfoEnabled: imported.some(({ source }) => source === 'lfo1'),
  }
}

function parseLossyLfo(
  settings: Record<string, unknown>,
  templateSettings: Record<string, unknown>,
  enabled: boolean,
  warnings: Set<string>,
): LfoState {
  const slots = settings.lfos
  if (!Array.isArray(slots) || !isRecord(slots[0])) {
    throw new VitalImportError('Vital settings has no usable LFO 1 slot')
  }
  const lfo = slots[0]
  const rawPoints = Array.isArray(lfo.points) ? lfo.points : []
  const rawPowers = Array.isArray(lfo.powers) ? lfo.powers : []
  const declaredCount = typeof lfo.num_points === 'number' ? Math.round(lfo.num_points) : 0
  const pointCount = clamp(Math.min(declaredCount, Math.floor(rawPoints.length / 2)), 2, 32)
  if (rawPoints.length < pointCount * 2) {
    throw new VitalImportError('Vital LFO 1 has insufficient point data')
  }
  const points = Array.from({ length: pointCount }, (_, index) => ({
    x: clamp(finiteNumber(rawPoints[index * 2], `Vital LFO 1 point ${index + 1} x`), 0, 1),
    y: clamp(
      decodeVitalLfoPointValue(
        finiteNumber(rawPoints[index * 2 + 1], `Vital LFO 1 point ${index + 1} y`),
      ),
      0,
      1,
    ),
    power: clamp(
      typeof rawPowers[index] === 'number' && Number.isFinite(rawPowers[index])
        ? rawPowers[index]
        : 0,
      -1,
      1,
    ),
  })).sort((left, right) => left.x - right.x)
  if (rawPowers.some((power) => typeof power === 'number' && Math.abs(power) > 1)) {
    warnOnce(warnings, 'LFO curve powers outside the workbench range were clamped.')
  }

  const sync = Math.round(lossySetting(settings, templateSettings, 'lfo_1_sync', warnings))
  let rate: LfoRate
  if (sync === 0) {
    rate = {
      mode: 'free',
      hz: clamp(
        2 ** lossySetting(settings, templateSettings, 'lfo_1_frequency', warnings),
        0.01,
        40,
      ),
    }
  } else {
    const tempo = Math.round(lossySetting(settings, templateSettings, 'lfo_1_tempo', warnings))
    const division = sync === 3 ? VITAL_TRIPLET_DIVISIONS[tempo] : VITAL_TEMPO_DIVISIONS[tempo]
    if (!division) warnOnce(warnings, 'An unsupported LFO division was mapped to 1/1.')
    rate = { mode: 'sync', division: division ?? '1/1' }
  }
  const syncType = lossySetting(settings, templateSettings, 'lfo_1_sync_type', warnings)
  if (syncType !== 0) warnOnce(warnings, 'LFO trigger/envelope mode was approximated by the looping workbench LFO.')
  return {
    enabled,
    points,
    rate,
    phase: clamp(lossySetting(settings, templateSettings, 'lfo_1_phase', warnings), 0, 1),
    smooth: lfo.smooth === true,
    smoothing: lfo.smooth === true ? 5 / 14 : 1.5 / 14,
  }
}

function lossyDelayDivision(sync: number, tempo: number, warnings: Set<string>): TempoSyncDivision {
  const division = sync === 3 ? VITAL_TRIPLET_DIVISIONS[tempo] : VITAL_TEMPO_DIVISIONS[tempo]
  if (!division) warnOnce(warnings, 'An unsupported delay division was mapped to 1/4.')
  return division ?? '1/4'
}

function parseLossyPatch(
  value: unknown,
  template: VitalPresetDocument,
  options: VitalImportOptions,
  strictError: VitalImportError,
): VitalImportResult {
  const document = record(value, 'Vital preset')
  const settings = record(document.settings, 'Vital settings')
  const templateSettings = record(template.settings, 'Template Vital settings')
  const sourceVersion = stringValue(document.synth_version, 'Vital synth_version')
  if (!sourceVersion.trim()) throw new VitalImportError('Vital synth_version must not be empty')
  const warnings = new Set<string>()
  warnOnce(warnings, `Imported with losses after the exact compatibility path rejected the preset: ${strictError.message}`)
  if (sourceVersion !== template.synth_version) {
    warnOnce(warnings, `Vital ${sourceVersion} was interpreted using the ${template.synth_version} parameter model.`)
  }

  const routes = readLossyRoutes(settings, templateSettings, warnings)
  if (routes.some(({ source, bypass }) => !bypass && /^macro_control_[1-4]$/.test(source))) {
    warnOnce(warnings, 'Current macro values were baked into supported destinations; interactive macro routing was omitted.')
  }
  const modulation = parseLossyModulations(routes, warnings)

  if (!Array.isArray(settings.wavetables) || settings.wavetables.length < 3) {
    throw new VitalImportError('Vital preset must contain at least three wavetable slots')
  }
  const firstWavetable = parseLossyWavetable(settings.wavetables[0], 1, warnings)
  const secondWavetable = parseLossyWavetable(settings.wavetables[1], 2, warnings)
  const thirdWavetable = parseLossyWavetable(settings.wavetables[2], 3, warnings)
  const wavetableData = Object.fromEntries(
    [firstWavetable, secondWavetable, thirdWavetable].map((wavetable) => [wavetable.id, wavetable]),
  )
  const oscillators: [OscillatorState, OscillatorState, OscillatorState] = [
    parseLossyOscillator(
      settings,
      templateSettings,
      routes,
      1,
      firstWavetable.id,
      warnings,
    ),
    parseLossyOscillator(
      settings,
      templateSettings,
      routes,
      2,
      secondWavetable.id,
      warnings,
    ),
    parseLossyOscillator(
      settings,
      templateSettings,
      routes,
      3,
      thirdWavetable.id,
      warnings,
    ),
  ]

  const activeProcessors = ['distortion', 'compressor'].filter((name) =>
    lossyBoolean(lossySetting(settings, templateSettings, `${name}_on`, warnings)),
  )
  const peakLevel = Math.max(...oscillators.filter(({ enabled }) => enabled).map(({ level }) => level), 0)
  if (activeProcessors.length > 0 && peakLevel > 0 && peakLevel < 0.1) {
    const scale = 0.7 / peakLevel
    oscillators.forEach((oscillator) => {
      if (oscillator.enabled) oscillator.level = Math.min(1, oscillator.level * scale)
    })
    warnOnce(warnings, 'Very low oscillator levels were normalized because nonlinear gain effects were omitted.')
  }

  const omittedSources: string[] = []
  if (lossyBoolean(lossySetting(settings, templateSettings, 'sample_on', warnings))) omittedSources.push('sample layer')
  if (omittedSources.length > 0) warnOnce(warnings, `Unsupported sound sources were omitted: ${omittedSources.join(', ')}.`)

  const omittedEffects = ['chorus', 'distortion', 'compressor', 'phaser', 'flanger', 'eq'].filter(
    (name) => lossyBoolean(lossySetting(settings, templateSettings, `${name}_on`, warnings)),
  )
  if (omittedEffects.length > 0) {
    warnOnce(warnings, `Unsupported enabled effects were omitted: ${omittedEffects.join(', ')}.`)
  }

  const filterFxEnabled = lossyBoolean(
    lossySetting(settings, templateSettings, 'filter_fx_on', warnings),
  )
  const filterOneEnabled = lossyBoolean(
    lossySetting(settings, templateSettings, 'filter_1_on', warnings),
  )
  let filterPrefix: 'filter_1' | 'filter_fx' = 'filter_fx'
  let filterEnabled = filterFxEnabled
  if (filterOneEnabled && !filterFxEnabled) {
    filterPrefix = 'filter_1'
    filterEnabled = true
    warnOnce(warnings, 'Legacy Filter 1 was moved into the workbench effects-chain filter.')
  } else if (filterOneEnabled) {
    warnOnce(warnings, 'Filter 1 was omitted because the effects-chain filter is active.')
  }
  if (lossyBoolean(lossySetting(settings, templateSettings, 'filter_2_on', warnings))) {
    warnOnce(warnings, 'Filter 2 was omitted.')
  }
  const filterType = parseLossyFxFilterType(settings, templateSettings, filterPrefix, warnings)
  if (
    filterPrefix === 'filter_fx' &&
    lossySetting(settings, templateSettings, 'filter_fx_mix', warnings) !== 1
  ) {
    warnOnce(warnings, 'The effects-chain filter mix was mapped to a fully wet workbench filter.')
  }
  const cutoffControl =
    lossySetting(settings, templateSettings, `${filterPrefix}_cutoff`, warnings) +
    macroContribution(routes, settings, `${filterPrefix}_cutoff`) * 128
  const effectOrder = parseLossyEffectOrder(settings, templateSettings, warnings)

  const style = typeof document.preset_style === 'string' ? document.preset_style : ''
  const category = VITAL_STYLE_CATEGORIES[style] ?? 'other'
  if (!(style in VITAL_STYLE_CATEGORIES)) {
    warnOnce(warnings, `Vital style “${style || '(empty)'}” was mapped to Other.`)
  }
  const documentName = typeof document.preset_name === 'string' ? document.preset_name.trim() : ''
  const name = (documentName || filenamePresetName(options.sourceFilename) || 'Imported Vital preset').slice(0, 80)
  if (!documentName) warnOnce(warnings, 'The preset name was recovered from the source filename.')
  const comments = typeof document.comments === 'string' ? document.comments.trim().slice(0, 500) : ''

  const delaySync = Math.round(lossySetting(settings, templateSettings, 'delay_sync', warnings))
  const delayFrequency = clamp(
    lossySetting(settings, templateSettings, 'delay_frequency', warnings),
    -2,
    9,
  )
  const delayTime = clamp(
    decodeVitalDelaySeconds(delayFrequency),
    DELAY_TIME_MIN_SECONDS,
    DELAY_TIME_MAX_SECONDS,
  )
  const delayMode = delaySync === 0 ? 'free' : 'sync'
  const reverbDecay = decodeVitalReverbDecaySeconds(
    clamp(lossySetting(settings, templateSettings, 'reverb_decay_time', warnings), -6, 6),
  )

  const patchCandidate = {
    version: 2,
    metadata: {
      name,
      category,
      ...(comments ? { description: comments } : {}),
      tags: ['vital-import', 'vital-lossy'],
    },
    oscillators,
    ampEnvelope: parseLossyEnvelope(settings, templateSettings, 'env_1', warnings),
    modEnvelope: parseLossyEnvelope(settings, templateSettings, 'env_2', warnings),
    filter: {
      enabled: filterEnabled,
      type: filterType,
      cutoffHz: clamp(
        decodeFilterCutoff(cutoffControl),
        FILTER_CUTOFF_MIN_HZ,
        FILTER_CUTOFF_MAX_HZ,
      ),
      resonance: clamp(
        lossySetting(settings, templateSettings, `${filterPrefix}_resonance`, warnings),
        0,
        1,
      ),
    },
    lfo1: parseLossyLfo(settings, templateSettings, modulation.lfoEnabled, warnings),
    modulations: modulation.routes,
    voice: {
      polyphony: clamp(
        Math.round(lossySetting(settings, templateSettings, 'polyphony', warnings)),
        1,
        16,
      ),
      legato: lossyBoolean(lossySetting(settings, templateSettings, 'legato', warnings)),
      glideSeconds: decodeVitalGlideSeconds(
        clamp(
          lossySetting(settings, templateSettings, 'portamento_time', warnings),
          -10,
          Math.log2(5),
        ),
      ),
      velocitySensitivity: clamp(
        lossySetting(settings, templateSettings, 'velocity_track', warnings),
        0,
        1,
      ),
    },
    effects: {
      order: effectOrder,
      delay: {
        enabled: lossyBoolean(lossySetting(settings, templateSettings, 'delay_on', warnings)),
        mode: delayMode,
        ...(delayMode === 'sync'
          ? {
              division: lossyDelayDivision(
                delaySync,
                Math.round(lossySetting(settings, templateSettings, 'delay_tempo', warnings)),
                warnings,
              ),
            }
          : {}),
        timeSeconds: delayTime,
        feedback: clamp(
          lossySetting(settings, templateSettings, 'delay_feedback', warnings),
          0,
          1,
        ),
        mix: clamp(lossySetting(settings, templateSettings, 'delay_dry_wet', warnings), 0, 1),
      },
      reverb: {
        enabled: lossyBoolean(lossySetting(settings, templateSettings, 'reverb_on', warnings)),
        mix: clamp(lossySetting(settings, templateSettings, 'reverb_dry_wet', warnings), 0, 1),
        decaySeconds: clamp(
          reverbDecay,
          REVERB_DECAY_MIN_SECONDS,
          REVERB_DECAY_MAX_SECONDS,
        ),
        size: clamp(lossySetting(settings, templateSettings, 'reverb_size', warnings), 0, 1),
      },
    },
    wavetableData,
  }

  try {
    const patch = parsePatchState(patchCandidate)
    if (document.author !== APP_AUTHOR) {
      warnOnce(warnings, 'Vital author metadata is informational and is not retained in PatchState.')
    }
    return { patch, warnings: [...warnings], sourceVersion }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown schema error'
    throw new VitalImportError(`Lossy Vital import is outside PatchState bounds: ${detail}`)
  }
}

function isLossyCandidate(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.synth_version === 'string' &&
    value.synth_version.trim().length > 0 &&
    isRecord(value.settings)
  )
}

export function importVitalPatch(
  value: unknown,
  template: VitalPresetDocument,
  options: VitalImportOptions = {},
): VitalImportResult {
  try {
    assertDocumentEnvelope(value, template)
    const patch = parsePatch(value, template)
    const warnings = [
      'Vital has no PatchState tags or modulation route IDs; import uses a vital-import tag and generated route IDs. Custom wavetable IDs are regenerated unless the table exactly matches the built-in registry.',
    ]
    if (value.author !== APP_AUTHOR) {
      warnings.push('Vital author metadata is informational and is not retained in PatchState.')
    }
    return { patch, warnings, sourceVersion: value.synth_version }
  } catch (error) {
    if (!(error instanceof VitalImportError) || !isLossyCandidate(value)) throw error
    return parseLossyPatch(value, template, options, error)
  }
}
