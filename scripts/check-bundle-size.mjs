import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { gzipSync } from 'node:zlib'

const assetDirectory = new URL('../dist/assets/', import.meta.url)
// The JavaScript budget covers the app bundle plus the Emscripten glue that the
// Vital worker inlines (~13 KiB gzip); the 1.4 MB `vital.wasm` payload ships as a
// separate asset and is not counted here. The app bundle measures 143 KiB gzip
// against a stub module, so the real total is expected near 156 KiB; 160 KiB left
// too little headroom once the Vital WASM engine landed.
const budgets = new Map([
  ['.js', 200 * 1024],
  ['.css', 20 * 1024],
])
const totals = new Map(Array.from(budgets.keys(), (extension) => [extension, 0]))

for (const entry of await readdir(assetDirectory, { withFileTypes: true })) {
  const extension = extname(entry.name)
  if (!entry.isFile() || !budgets.has(extension)) continue
  const contents = await readFile(new URL(entry.name, assetDirectory))
  totals.set(extension, (totals.get(extension) ?? 0) + gzipSync(contents).byteLength)
}

let failed = false
for (const [extension, budget] of budgets) {
  const total = totals.get(extension) ?? 0
  const label = extension.slice(1).toUpperCase()
  console.log(`${label}: ${(total / 1024).toFixed(1)} KiB gzip / ${(budget / 1024).toFixed(0)} KiB budget`)
  failed ||= total > budget
}

if (failed) {
  throw new Error('Production bundle exceeds its compressed-size budget')
}
