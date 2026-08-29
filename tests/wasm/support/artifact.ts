import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function findVitalArtifact(): string | null {
  const artifact = resolve(process.cwd(), 'wasm/vital/build/vital.mjs')
  return existsSync(artifact) ? artifact : null
}
