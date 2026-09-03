import { describe, expect, it } from 'vitest'

import {
  OPERATION_DEFINITIONS,
  OPERATION_JSON_SCHEMAS,
  OPERATION_SIGNATURES,
  operationSchema,
  operationSignature,
} from '../../src/ops/schema'

function validValue(json: Record<string, unknown>): unknown {
  if (Array.isArray(json.enum)) return json.enum[0]
  if (json.type === 'boolean') return true
  if (json.type === 'string') return 'value'
  if (json.type === 'integer' || json.type === 'number') return json.minimum ?? 0
  throw new TypeError(`Unsupported test schema: ${JSON.stringify(json)}`)
}

describe('operation schema registry parity', () => {
  it('derives Zod, JSON Schema, and displayed signatures for every operation field', () => {
    expect(OPERATION_DEFINITIONS).toHaveLength(12)

    OPERATION_DEFINITIONS.forEach((definition, operationIndex) => {
      const json = OPERATION_JSON_SCHEMAS[operationIndex] as {
        properties: Record<string, Record<string, unknown>>
        required: string[]
        additionalProperties: boolean
      }
      const signature = OPERATION_SIGNATURES[operationIndex]
      const requiredFields = Object.entries(definition.fields)
        .filter(([, field]) => !field.optional)
        .map(([name]) => name)

      expect(json.additionalProperties).toBe(false)
      expect(json.properties.op).toEqual({ type: 'string', const: definition.name })
      expect(Object.keys(json.properties)).toEqual(['op', ...Object.keys(definition.fields)])
      expect(json.required).toEqual(['op', ...requiredFields])
      expect(signature).toBe(operationSignature(definition))
      expect(signature).toContain(`{ op: "${definition.name}"`)

      const validInput: Record<string, unknown> = { op: definition.name }
      for (const [fieldName, field] of Object.entries(definition.fields)) {
        const fieldJson = json.properties[fieldName]
        expect(fieldJson).toEqual(field.json)
        expect(signature).toContain(
          `${fieldName}${field.optional ? '?' : ''}: ${field.display}`,
        )
        validInput[fieldName] = validValue(fieldJson)
      }
      expect(operationSchema.safeParse(validInput).success).toBe(true)

      for (const fieldName of requiredFields) {
        const missing = { ...validInput }
        delete missing[fieldName]
        expect(operationSchema.safeParse(missing).success).toBe(false)
      }
      for (const [fieldName, field] of Object.entries(definition.fields)) {
        if (!field.optional) continue
        const omitted = { ...validInput }
        delete omitted[fieldName]
        expect(operationSchema.safeParse(omitted).success).toBe(true)
      }
    })
  })

  it('keeps enum, type, and numeric bounds identical between Zod and published JSON', () => {
    OPERATION_DEFINITIONS.forEach((definition, operationIndex) => {
      const json = OPERATION_JSON_SCHEMAS[operationIndex] as {
        properties: Record<string, Record<string, unknown>>
      }

      for (const [fieldName, field] of Object.entries(definition.fields)) {
        const fieldJson = json.properties[fieldName]
        if (Array.isArray(fieldJson.enum)) {
          for (const value of fieldJson.enum) expect(field.zod.safeParse(value).success).toBe(true)
          expect(field.zod.safeParse('__invalid_enum__').success).toBe(false)
        }
        if (fieldJson.type === 'boolean') {
          expect(field.zod.safeParse(true).success).toBe(true)
          expect(field.zod.safeParse('true').success).toBe(false)
        }
        if (fieldJson.type === 'string' && !Array.isArray(fieldJson.enum)) {
          expect(field.zod.safeParse('value').success).toBe(true)
          expect(field.zod.safeParse('').success).toBe(false)
        }
        if (fieldJson.type === 'number' || fieldJson.type === 'integer') {
          const minimum = fieldJson.minimum as number
          const maximum = fieldJson.maximum as number
          expect(field.zod.safeParse(minimum).success).toBe(true)
          expect(field.zod.safeParse(maximum).success).toBe(true)
          expect(field.zod.safeParse(minimum - 1).success).toBe(false)
          expect(field.zod.safeParse(maximum + 1).success).toBe(false)
          if (fieldJson.type === 'integer') expect(field.zod.safeParse(minimum + 0.5).success).toBe(false)
        }
      }
    })
  })

  it('documents the layer role level default and override', () => {
    const layer = OPERATION_DEFINITIONS.find(({ name }) => name === 'layer')!
    expect(layer.mapping).toContain("otherwise the role's default level is written")
  })

  it('keeps compressor precision on raw paths without adding a competing operation', () => {
    expect(OPERATION_DEFINITIONS.map(({ name }) => name)).not.toContain('compressor')
  })
})
