import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function findVitalArtifact(): string | null {
  const artifact = resolve(process.cwd(), 'wasm/vital/build/vital.mjs')
  return existsSync(artifact) ? artifact : null
}

export function findVitalNativeRenderer(): string | null {
  const artifact = resolve(process.cwd(), 'wasm/vital/native/build/vital-native-render')
  return existsSync(artifact) ? artifact : null
}
