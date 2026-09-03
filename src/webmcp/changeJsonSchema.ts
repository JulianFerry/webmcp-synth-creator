import { OPERATION_JSON_SCHEMAS } from '../ops/schema'
import { SUPPORTED_PATCH_PATHS } from '../patch/paths'

const rawChangeJsonSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', enum: [...SUPPORTED_PATCH_PATHS] },
    value: {
      description:
        'JSON value for the selected path. The path-specific type and bounds are validated before commit.',
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array' },
        { type: 'object' },
      ],
    },
  },
  required: ['path', 'value'],
  additionalProperties: false,
}

export const CHANGE_JSON_SCHEMA = {
  oneOf: [...OPERATION_JSON_SCHEMAS, rawChangeJsonSchema],
}
