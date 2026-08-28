import { describe, expect, it } from 'vitest'

import {
  MAX_VITAL_IMPORT_BYTES,
  readVitalImportFile,
} from '../../src/vital/importFile'

describe('Vital browser file input', () => {
  it('accepts a bounded .vital JSON file', async () => {
    const document = await readVitalImportFile(
      new File(['{"synth_version":"1.0.7"}'], 'Patch.vital', {
        type: 'application/json',
      }),
    )
    expect(document).toEqual({ synth_version: '1.0.7' })
  })

  it('rejects malformed JSON and unsafe or wrong filenames', async () => {
    await expect(readVitalImportFile(new File(['{'], 'broken.vital'))).rejects.toThrow(
      /not valid JSON/,
    )
    await expect(readVitalImportFile(new File(['{}'], 'preset.json'))).rejects.toThrow(
      /.vital extension/,
    )
    await expect(readVitalImportFile(new File(['{}'], '../preset.vital'))).rejects.toThrow(
      /safe filename/,
    )
  })

  it('rejects empty and oversized files before JSON parsing', async () => {
    await expect(readVitalImportFile(new File([], 'empty.vital'))).rejects.toThrow(/empty/)
    await expect(
      readVitalImportFile(
        new File([new Uint8Array(MAX_VITAL_IMPORT_BYTES + 1)], 'oversized.vital'),
      ),
    ).rejects.toThrow(/5 MiB/)
  })
})
