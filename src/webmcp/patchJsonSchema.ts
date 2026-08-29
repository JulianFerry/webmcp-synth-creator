import {
  DELAY_TIME_MAX_SECONDS,
  DELAY_TIME_MIN_SECONDS,
  ENVELOPE_HOLD_MAX_SECONDS,
  REVERB_DECAY_MAX_SECONDS,
  REVERB_DECAY_MIN_SECONDS,
  TEMPO_SYNC_DIVISIONS,
} from '../patch/limits'

const unitInterval = { type: 'number', minimum: 0, maximum: 1 }
const envelopeSchema = {
  type: 'object',
  properties: {
    attackSeconds: { type: 'number', minimum: 0, maximum: 10 },
    holdSeconds: { type: 'number', minimum: 0, maximum: ENVELOPE_HOLD_MAX_SECONDS },
    decaySeconds: { type: 'number', minimum: 0, maximum: 10 },
    sustainLevel: unitInterval,
    releaseSeconds: { type: 'number', minimum: 0, maximum: 20 },
  },
  required: [
    'attackSeconds',
    'holdSeconds',
    'decaySeconds',
    'sustainLevel',
    'releaseSeconds',
  ],
  additionalProperties: false,
}

const oscillatorSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    wavetableId: { type: 'string', minLength: 1, maxLength: 64 },
    wavetablePosition: unitInterval,
    level: unitInterval,
    transposeSemitones: { type: 'integer', minimum: -24, maximum: 24 },
    fineTuneCents: { type: 'number', minimum: -100, maximum: 100 },
    unisonVoices: { type: 'integer', minimum: 1, maximum: 8 },
    unisonDetune: unitInterval,
    stereoSpread: unitInterval,
    randomPhase: unitInterval,
  },
  required: [
    'enabled',
    'wavetableId',
    'wavetablePosition',
    'level',
    'transposeSemitones',
    'fineTuneCents',
    'unisonVoices',
    'unisonDetune',
    'stereoSpread',
    'randomPhase',
  ],
  additionalProperties: false,
}

const lfoPointSchema = {
  type: 'object',
  properties: {
    x: unitInterval,
    y: unitInterval,
    power: { type: 'number', minimum: -1, maximum: 1 },
  },
  required: ['x', 'y'],
  additionalProperties: false,
}

const wavetableSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    frames: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: {
        type: 'object',
        properties: {
          harmonics: {
            type: 'array',
            minItems: 1,
            maxItems: 128,
            items: unitInterval,
          },
        },
        required: ['harmonics'],
        additionalProperties: false,
      },
    },
  },
  required: ['id', 'name', 'frames'],
  additionalProperties: false,
}

export const PATCH_STATE_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    version: { enum: [1, 2] },
    metadata: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        category: {
          type: 'string',
          enum: ['pad', 'bass', 'lead', 'pluck', 'keys', 'atmosphere', 'rhythmic', 'other'],
        },
        description: { type: 'string', minLength: 1, maxLength: 500 },
        tags: {
          type: 'array',
          maxItems: 12,
          items: { type: 'string', minLength: 1, maxLength: 32 },
        },
      },
      required: ['name', 'tags'],
      additionalProperties: false,
    },
    oscillators: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: oscillatorSchema,
    },
    ampEnvelope: envelopeSchema,
    modEnvelope: envelopeSchema,
    filter: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        type: { type: 'string', enum: ['lowpass', 'highpass', 'bandpass', 'notch'] },
        cutoffHz: { type: 'integer', minimum: 20, maximum: 20_000 },
        resonance: unitInterval,
      },
      required: ['enabled', 'type', 'cutoffHz', 'resonance'],
      additionalProperties: false,
    },
    lfo1: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        points: { type: 'array', minItems: 2, maxItems: 32, items: lfoPointSchema },
        rate: {
          oneOf: [
            {
              type: 'object',
              properties: {
                mode: { const: 'sync' },
                division: { type: 'string', enum: [...TEMPO_SYNC_DIVISIONS] },
              },
              required: ['mode', 'division'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                mode: { const: 'free' },
                hz: { type: 'number', minimum: 0.01, maximum: 40 },
              },
              required: ['mode', 'hz'],
              additionalProperties: false,
            },
          ],
        },
        phase: unitInterval,
        smooth: { type: 'boolean' },
      },
      required: ['enabled', 'points', 'rate', 'phase', 'smooth'],
      additionalProperties: false,
    },
    modulations: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64 },
          source: { type: 'string', enum: ['lfo1', 'modEnvelope'] },
          destination: {
            type: 'string',
            enum: [
              'oscillator1.level',
              'oscillator1.wavetablePosition',
              'oscillator1.pitch',
              'oscillator2.level',
              'oscillator2.wavetablePosition',
              'oscillator2.pitch',
              'oscillator3.level',
              'oscillator3.wavetablePosition',
              'oscillator3.pitch',
              'filter.cutoff',
            ],
          },
          amount: { type: 'number', minimum: -1, maximum: 1 },
          bipolar: { type: 'boolean' },
        },
        required: ['id', 'source', 'destination', 'amount', 'bipolar'],
        additionalProperties: false,
      },
    },
    voice: {
      type: 'object',
      properties: {
        polyphony: { type: 'integer', minimum: 1, maximum: 16 },
        legato: { type: 'boolean' },
        glideSeconds: { type: 'number', minimum: 0, maximum: 5 },
        velocitySensitivity: unitInterval,
      },
      required: ['polyphony', 'legato', 'glideSeconds', 'velocitySensitivity'],
      additionalProperties: false,
    },
    effects: {
      type: 'object',
      properties: {
        delay: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            mode: { type: 'string', enum: ['sync', 'free'] },
            division: { type: 'string', enum: [...TEMPO_SYNC_DIVISIONS] },
            timeSeconds: {
              type: 'number',
              minimum: DELAY_TIME_MIN_SECONDS,
              maximum: DELAY_TIME_MAX_SECONDS,
            },
            feedback: unitInterval,
            mix: unitInterval,
          },
          required: ['enabled', 'mode', 'feedback', 'mix'],
          additionalProperties: false,
        },
        reverb: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            mix: unitInterval,
            decaySeconds: {
              type: 'number',
              minimum: REVERB_DECAY_MIN_SECONDS,
              maximum: REVERB_DECAY_MAX_SECONDS,
            },
            size: unitInterval,
          },
          required: ['enabled', 'mix', 'decaySeconds', 'size'],
          additionalProperties: false,
        },
      },
      required: ['delay', 'reverb'],
      additionalProperties: false,
    },
    wavetableData: {
      type: 'object',
      minProperties: 1,
      additionalProperties: wavetableSchema,
    },
  },
  required: [
    'version',
    'metadata',
    'oscillators',
    'ampEnvelope',
    'modEnvelope',
    'filter',
    'lfo1',
    'modulations',
    'voice',
    'effects',
    'wavetableData',
  ],
  additionalProperties: false,
}
