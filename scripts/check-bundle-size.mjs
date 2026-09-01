import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { gzipSync } from 'node:zlib'

const assetDirectory = new URL('../dist/assets/', import.meta.url)
const budgets = new Map([
  ['.js', 160 * 1024],
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
