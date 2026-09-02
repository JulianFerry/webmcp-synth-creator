import { z } from 'zod'

import { TEMPO_SYNC_DIVISIONS } from '../patch/limits'
import type { Operation } from './types'

type JsonSchema = Record<string, unknown>

interface FieldDefinition {
  zod: z.ZodTypeAny
  json: JsonSchema
  display: string
  optional: boolean
}

type FieldRegistry = Record<string, FieldDefinition>

interface OperationDefinition {
  name: Operation['op']
  fields: FieldRegistry
  mapping: string
}

const required = (zod: z.ZodTypeAny, json: JsonSchema, display: string): FieldDefinition => ({
  zod,
  json,
  display,
  optional: false,
})

const optional = (field: FieldDefinition): FieldDefinition => ({ ...field, optional: true })
const normalized = () => required(z.number().finite().min(0).max(1), { type: 'number', minimum: 0, maximum: 1 }, '0..1')
const boolean = () => required(z.boolean(), { type: 'boolean' }, 'bool')
const enumeration = <T extends readonly [string, ...string[]]>(values: T) =>
  required(z.enum(values), { type: 'string', enum: [...values] }, values.map((value) => JSON.stringify(value)).join(' | '))
const integer = (minimum: number, maximum: number) =>
  required(z.number().int().min(minimum).max(maximum), { type: 'integer', minimum, maximum }, `${minimum}..${maximum}`)
const text = () => required(z.string().trim().min(1), { type: 'string', minLength: 1 }, 'string')
const target = () => required(
  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('both'), z.literal('all')]),
  { enum: [1, 2, 3, 'both', 'all'] },
  '1 | 2 | 3 | "both" | "all"',
)

export const OPERATION_DEFINITIONS = [
  {
    name: 'tone',
    fields: { brightness: normalized(), keep_air: optional(boolean()), resonance: optional(normalized()) },
    mapping: `filter.enabled  = true
filter.type     = "lowpass"
filter.slope    = keep_air ? 12 : 24
filter.cutoffHz = cutoffHz(0.12 + brightness*0.80 + (keep_air ? 0.06 : 0))
if resonance given: filter.resonance = resonance`,
  },
  {
    name: 'articulation',
    fields: {
      kind: enumeration(['pluck', 'stab', 'percussive', 'keys', 'bell', 'pad', 'swell', 'sustain', 'reverse']),
      speed: optional(normalized()),
    },
    mapping: `Values are seconds; sustainLevel and decayCurve are unscaled.
kind       delay attack hold decay sustain release decayCurve
pluck      0     0.00   0    0.18  0.00    0.12    -0.6
stab       0     0.00   0    0.10  0.00    0.06    -0.7
percussive 0     0.00   0    0.06  0.00    0.04    -0.8
keys       0     0.00   0    0.35  0.45    0.25    -0.5
bell       0     0.00   0    0.55  0.00    0.50    -0.8
pad        0     0.45   0    0.40  0.85    0.62     0.0
swell      0     0.72   0    0.30  0.90    0.70    +0.3
sustain    0     0.02   0    0.10  1.00    0.15     0.0
reverse    0     0.85   0.05 0.05  0.00    0.02    +0.5
writes ampEnvelope.{delaySeconds,attackSeconds,holdSeconds,decaySeconds,sustainLevel,releaseSeconds,decayCurve}
speed (default 0.5): t' = t * (0.25 + speed*1.5), applied to delay/attack/hold/decay/release only`,
  },
  {
    name: 'timbre',
    fields: {
      character: enumeration(['pure', 'warm', 'bright', 'hollow', 'vocal', 'metallic', 'glassy', 'harsh', 'digital']),
      position: optional(normalized()),
      target: optional(target()),
    },
    mapping: `target defaults to 1; "both" = oscillators 1-2; "all" = oscillators 1-3.
character wavetableId defaultPosition: pure sine 0.00; warm warm-saw 0.35; bright airy 0.70; hollow soft-square 0.30; vocal vocal 0.45; metallic metallic 0.55; glassy glass 0.40; harsh harsh 0.75; digital digital 0.50.
Also sets oscillators.N.enabled = true.`,
  },
  {
    name: 'width',
    fields: { amount: normalized(), method: optional(enumeration(['unison', 'pan', 'stereo_fx', 'auto'])) },
    mapping: `auto (default): unison below 0.6; unison + stereo_fx at or above 0.6
unison: oscillators.0.unisonVoices = clamp(round(1 + amount*8), 1, 8)
         oscillators.0.unisonDetune = amount*0.7
         oscillators.0.stereoSpread = 0.3 + amount*0.7
pan: oscillators.0.pan = 0.5 - amount*0.3; oscillators.1.pan = 0.5 + amount*0.3
stereo_fx: effects.chorus.enabled = amount > 0.2; effects.chorus.mix = amount*0.5
delay.time_right offset is dropped in V1.`,
  },
  {
    name: 'space',
    fields: { amount: normalized(), size: optional(normalized()), delay_amount: optional(normalized()), predelay: optional(normalized()) },
    mapping: `effects.reverb.enabled = amount > 0.02
effects.reverb.mix = amount*0.75
if size given: effects.reverb.size = size
effects.reverb.decaySeconds = revDecay(0.3 + amount*0.5)
effects.reverb.predelay = predelay ?? 0.1
if delay_amount given: effects.delay.enabled = delay_amount > 0.02; effects.delay.mix = delay_amount*0.6; effects.delay.mode = "sync"; effects.delay.division = "1/8"; effects.delay.feedback = 0.2 + delay_amount*0.4`,
  },
  {
    name: 'drive',
    fields: { amount: normalized(), character: optional(enumeration(['soft', 'hard', 'fold', 'crush'])) },
    mapping: `effects.distortion.enabled = amount > 0.02
effects.distortion.type = {soft:"soft_clip", hard:"hard_clip", fold:"sine_fold", crush:"bit_crush"}[character ?? "soft"]
effects.distortion.drive = amount
effects.distortion.mix = 0.4 + amount*0.6
filter.drive = amount*0.4`,
  },
  {
    name: 'movement',
    fields: {
      amount: normalized(), rate: optional(normalized()),
      target: optional(enumeration(['position', 'cutoff', 'pitch', 'pan', 'level'])),
      shape: optional(enumeration(['sine', 'triangle', 'ramp_up', 'ramp_down', 'random', 'smooth_random'])),
      sync: optional(boolean()),
    },
    mapping: `Target defaults to position; Shape defaults to sine.
lfo1.enabled = true; lfo1.points = SHAPES[shape ?? "sine"]
lfo1.rate = sync ?? true ? {mode:"sync", division:divisionFor(rate ?? 0.25)} : {mode:"free", hz:lfoHz(rate ?? 0.25)}
lfo1.smoothing = 0.4
upsertRoute(lfo1 -> destFor(target), amount = amount*0.6, bipolar = true)
destFor: position -> oscillator1.wavetablePosition; cutoff -> filter.cutoff; pitch -> oscillator1.pitch; pan -> oscillator1.pan; level -> oscillator1.level.`,
  },
  {
    name: 'gate',
    fields: {
      pattern: enumeration(['even_8', 'even_16', 'offbeat', 'long_short', 'short_long', 'triplet', 'dotted', 'swung', 'stutter', 'none']),
      division: optional(enumeration(TEMPO_SYNC_DIVISIONS)), depth: optional(normalized()),
      smoothing: optional(normalized()), target: optional(enumeration(['level', 'cutoff', 'both'])),
    },
    mapping: `lfo1.enabled = true; lfo1.points = PATTERNS[pattern]; lfo1.rate = {mode:"sync", division:division ?? "1/1"}; lfo1.smoothing = smoothing ?? 0.08
target level|both: upsertRoute(lfo1 -> volume, amount = -(depth ?? 0.85))
target cutoff|both: upsertRoute(lfo1 -> filter.cutoff, amount = -(depth ?? 0.85))
pattern none: remove both routes and set lfo1.points = [{x:0,y:1},{x:1,y:1}].`,
  },
  {
    name: 'balance',
    fields: { osc1: optional(normalized()), osc2: optional(normalized()), osc3: optional(normalized()) },
    mapping: `oscillators.N.level = value
oscillators.N.enabled = value > 0 for osc2/osc3.`,
  },
  {
    name: 'layer',
    fields: {
      role: enumeration(['sub', 'octave_up', 'fifth', 'unison_detune', 'none']),
      level: optional(normalized()), wavetable: optional(text()),
    },
    mapping: `Role table (transpose, default level, voices, detune, wavetableId): sub (-12, 0.35, 1, 0, sine); octave_up (+12, 0.22, 1, 0, inherit); fifth (+7, 0.18, 1, 0, inherit); unison_detune (0, 0.45, 3, 0.4, inherit); none disables oscillator 2 at level 0.
wavetable overrides the role table. level is a partial-write override: when level is omitted, oscillators.1.level is left untouched.`,
  },
  {
    name: 'pitch',
    fields: {
      octave: optional(integer(-3, 3)), semitones: optional(integer(-12, 12)), glide: optional(normalized()),
      mono: optional(boolean()), legato: optional(boolean()),
    },
    mapping: `voice.transposeSemitones = clamp((octave ?? 0)*12 + (semitones ?? 0), -36, 36)
voice.glideSeconds = glideSeconds(glide ?? 0)
voice.polyphony = mono ? 1 : 8
voice.legato = legato ?? (mono ?? false)`,
  },
  {
    name: 'response',
    fields: { velocity_to_level: optional(normalized()), velocity_to_cutoff: optional(normalized()), keytrack: optional(normalized()) },
    mapping: `if velocity_to_level given: voice.velocitySensitivity = velocity_to_level
if velocity_to_cutoff given: upsertRoute(velocity -> filter.cutoff, amount = velocity_to_cutoff)
if keytrack given: filter.keytrack = keytrack
Routes reaching amount 0 are removed, not left at zero.`,
  },
] as const satisfies readonly OperationDefinition[]

function zodOperation(definition: OperationDefinition): z.ZodObject<z.ZodRawShape> {
  const fields = Object.fromEntries(
    Object.entries(definition.fields).map(([name, field]) => [
      name,
      field.optional ? field.zod.optional() : field.zod,
    ]),
  )
  return z.object({ op: z.literal(definition.name), ...fields }).strict()
}

function jsonOperation(definition: OperationDefinition): JsonSchema {
  return {
    type: 'object',
    properties: {
      op: { type: 'string', const: definition.name },
      ...Object.fromEntries(Object.entries(definition.fields).map(([name, field]) => [name, field.json])),
    },
    required: ['op', ...Object.entries(definition.fields).filter(([, field]) => !field.optional).map(([name]) => name)],
    additionalProperties: false,
  }
}

export function operationSignature(definition: OperationDefinition): string {
  const fields = Object.entries(definition.fields).map(
    ([name, field]) => `${name}${field.optional ? '?' : ''}: ${field.display}`,
  )
  return `{ op: "${definition.name}"${fields.length > 0 ? `, ${fields.join(', ')}` : ''} }`
}

const generatedZodSchemas = OPERATION_DEFINITIONS.map(zodOperation)

function asZodUnionOptions(
  schemas: z.ZodTypeAny[],
): [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]] {
  if (schemas.length < 2) throw new TypeError('At least two operation schemas are required')
  return [schemas[0], schemas[1], ...schemas.slice(2)]
}

export const operationSchema = z.union(
  asZodUnionOptions(generatedZodSchemas),
) as z.ZodType<Operation>

export const OPERATION_NAMES = OPERATION_DEFINITIONS.map(({ name }) => name)
export const OPERATION_JSON_SCHEMAS = OPERATION_DEFINITIONS.map(jsonOperation)
export const OPERATION_SIGNATURES = OPERATION_DEFINITIONS.map(operationSignature)
export const OPERATION_TABLE = [
  'The V1 operation vocabulary. Arguments are normalized 0..1 unless noted; right-hand sides are PatchState values in musical units.',
  ...OPERATION_DEFINITIONS.map(
    (definition) => `### ${definition.name}\n${operationSignature(definition)}\n${definition.mapping}`,
  ),
].join('\n\n')
