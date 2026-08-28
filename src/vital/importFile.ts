import { VitalImportError } from './VitalPresetImporter'

export const MAX_VITAL_IMPORT_BYTES = 5 * 1024 * 1024

export async function readVitalImportFile(file: File): Promise<unknown> {
  const name = file.name.trim()
  if (name.length < 1 || name.length > 255 || name.includes('/') || name.includes('\\')) {
    throw new VitalImportError('Choose a .vital file with a safe filename')
  }
  if (!name.toLowerCase().endsWith('.vital')) {
    throw new VitalImportError('Choose a file with the .vital extension')
  }
  if (file.size < 1) throw new VitalImportError('The selected .vital file is empty')
  if (file.size > MAX_VITAL_IMPORT_BYTES) {
    throw new VitalImportError('The selected .vital file exceeds the 5 MiB import limit')
  }

  const text = await file.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new VitalImportError('The selected .vital file is not valid JSON')
  }
}
