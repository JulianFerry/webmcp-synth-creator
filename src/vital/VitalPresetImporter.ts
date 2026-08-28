import { parsePatchState } from '../patch/schemas'
import type { TempoSyncDivision } from '../patch/limits'
import type {
  EnvelopeState,
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

export class VitalImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VitalImportError'
  }
}

export interface VitalImportResult {
  patch: PatchState
  warnings: string[]
  sourceVersion: '1.0.7'
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
  'polyphony',
  'legato',
  'velocity_track',
  'portamento_time',
  'osc_1_on',
  'osc_1_destination',
  'osc_1_level',
  'osc_1_wave_frame',
  'osc_1_transpose',
  'osc_1_tune',
  'osc_1_unison_voices',
  'osc_1_unison_detune',
  'osc_1_stereo_spread',
  'osc_1_random_phase',
  'osc_2_on',
  'osc_2_destination',
  'osc_2_level',
  'osc_2_wave_frame',
  'osc_2_transpose',
  'osc_2_tune',
  'osc_2_unison_voices',
  'osc_2_unison_detune',
  'osc_2_stereo_spread',
  'osc_2_random_phase',
  'env_1_attack',
  'env_1_hold',
  'env_1_decay',
  'env_1_sustain',
  'env_1_release',
  'env_2_attack',
  'env_2_hold',
  'env_2_decay',
  'env_2_sustain',
  'env_2_release',
  'filter_1_on',
  'filter_1_cutoff',
  'filter_1_resonance',
  'filter_2_on',
  'lfo_1_sync',
  'lfo_1_sync_type',
  'lfo_1_tempo',
  'lfo_1_frequency',
  'lfo_1_phase',
  'lfo_1_smooth_time',
  'delay_on',
  'delay_dry_wet',
  'delay_feedback',
  'delay_sync',
  'delay_aux_sync',
  'delay_tempo',
  'delay_aux_tempo',
  'delay_frequency',
  'delay_aux_frequency',
  'reverb_on',
  'reverb_dry_wet',
  'reverb_decay_time',
  'reverb_size',
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

function parseEnvelope(settings: Record<string, unknown>, prefix: 'env_1' | 'env_2'): EnvelopeState {
  return {
    attackSeconds: decodeVitalEnvelopeSeconds(setting(settings, `${prefix}_attack`)),
    holdSeconds: decodeVitalEnvelopeSeconds(setting(settings, `${prefix}_hold`)),
    decaySeconds: decodeVitalEnvelopeSeconds(setting(settings, `${prefix}_decay`)),
    sustainLevel: setting(settings, `${prefix}_sustain`),
    releaseSeconds: decodeVitalEnvelopeSeconds(setting(settings, `${prefix}_release`)),
  }
}

function parseOscillator(
  settings: Record<string, unknown>,
  index: 1 | 2,
  wavetableId: string,
): OscillatorState {
  const prefix = `osc_${index}`
  if (setting(settings, `${prefix}_destination`) !== 0) {
    throw new VitalImportError(`Oscillator ${index} must route only through Filter 1`)
  }
  return {
    enabled: numericBoolean(setting(settings, `${prefix}_on`), `${prefix}_on`),
    wavetableId,
    wavetablePosition: setting(settings, `${prefix}_wave_frame`) / 256,
    level: setting(settings, `${prefix}_level`),
    transposeSemitones: integer(setting(settings, `${prefix}_transpose`), `${prefix}_transpose`),
    fineTuneCents: setting(settings, `${prefix}_tune`) * 100,
    unisonVoices: integer(
      setting(settings, `${prefix}_unison_voices`),
      `${prefix}_unison_voices`,
    ),
    unisonDetune: setting(settings, `${prefix}_unison_detune`) / 12,
    stereoSpread: setting(settings, `${prefix}_stereo_spread`),
    randomPhase: setting(settings, `${prefix}_random_phase`),
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
  const expectedSmoothTime = lfo.smooth ? -5 : -8.5
  if (Math.abs(setting(settings, 'lfo_1_smooth_time') - expectedSmoothTime) > 1e-6) {
    throw new VitalImportError('Vital LFO 1 smoothing is outside the supported canonical mapping')
  }

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
    phase: setting(settings, 'lfo_1_phase'),
    smooth: lfo.smooth,
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

  if (setting(settings, 'filter_2_on') !== 0) {
    throw new VitalImportError('Filter 2 must be off for PatchState compatibility')
  }
  for (const key of ['filter_1_model', 'filter_1_style'] as const) {
    if (!valuesEqual(settings[key], templateSettings[key])) {
      throw new VitalImportError('Only the pinned lowpass Filter 1 model is supported')
    }
  }

  const importedWavetables = array(settings.wavetables, 'Vital wavetables')
  const templateWavetables = array(templateSettings.wavetables, 'Template Vital wavetables')
  if (importedWavetables.length !== templateWavetables.length || importedWavetables.length < 2) {
    throw new VitalImportError('Vital preset must retain the pinned wavetable slot count')
  }
  for (let index = 2; index < importedWavetables.length; index += 1) {
    if (!valuesEqual(importedWavetables[index], templateWavetables[index])) {
      throw new VitalImportError(`Unsupported Vital wavetable slot ${index + 1} contains material`)
    }
  }
  const firstWavetable = parseWavetable(importedWavetables[0], 1, document.synth_version)
  const secondWavetable = parseWavetable(importedWavetables[1], 2, document.synth_version)
  const wavetableData = Object.fromEntries(
    [firstWavetable, secondWavetable].map((wavetable) => [wavetable.id, wavetable]),
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
    version: 1,
    metadata: {
      name,
      category,
      ...(comments ? { description: comments } : {}),
      tags: ['vital-import'],
    },
    oscillators: [
      parseOscillator(settings, 1, firstWavetable.id),
      parseOscillator(settings, 2, secondWavetable.id),
    ],
    ampEnvelope: parseEnvelope(settings, 'env_1'),
    modEnvelope: parseEnvelope(settings, 'env_2'),
    filter: {
      enabled: numericBoolean(setting(settings, 'filter_1_on'), 'filter_1_on'),
      type: 'lowpass',
      cutoffHz: decodeFilterCutoff(setting(settings, 'filter_1_cutoff')),
      resonance: setting(settings, 'filter_1_resonance'),
    },
    lfo1: parseLfo(importedLfos[0], settings, modulation.lfoEnabled),
    modulations: modulation.routes,
    voice: {
      polyphony: integer(setting(settings, 'polyphony'), 'polyphony'),
      legato: numericBoolean(setting(settings, 'legato'), 'legato'),
      glideSeconds: decodeVitalGlideSeconds(setting(settings, 'portamento_time')),
      velocitySensitivity: setting(settings, 'velocity_track'),
    },
    effects: {
      delay: {
        enabled: numericBoolean(setting(settings, 'delay_on'), 'delay_on'),
        mode: delayMode,
        ...(delayMode === 'sync'
          ? { division: parseDelayDivision(delaySync, delayTempo) }
          : { timeSeconds: decodeVitalDelaySeconds(delayFrequency) }),
        ...(delayMode === 'sync'
          ? { timeSeconds: decodeVitalDelaySeconds(delayFrequency) }
          : {}),
        feedback: setting(settings, 'delay_feedback'),
        mix: setting(settings, 'delay_dry_wet'),
      },
      reverb: {
        enabled: numericBoolean(setting(settings, 'reverb_on'), 'reverb_on'),
        mix: setting(settings, 'reverb_dry_wet'),
        decaySeconds: decodeVitalReverbDecaySeconds(setting(settings, 'reverb_decay_time')),
        size: setting(settings, 'reverb_size'),
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

export function importVitalPatch(
  value: unknown,
  template: VitalPresetDocument,
): VitalImportResult {
  assertDocumentEnvelope(value, template)
  const patch = parsePatch(value, template)
  const warnings = [
    'Vital has no PatchState tags or modulation route IDs; import uses a vital-import tag and generated route IDs. Custom wavetable IDs are regenerated unless the table exactly matches the built-in registry.',
  ]
  if (value.author !== APP_AUTHOR) {
    warnings.push('Vital author metadata is informational and is not retained in PatchState.')
  }
  return { patch, warnings, sourceVersion: '1.0.7' }
}
