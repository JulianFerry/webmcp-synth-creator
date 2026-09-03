import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

interface UpstreamRecord {
  appliedPatches: string[]
  commit: string
  juceModules: string[]
  license: { spdx: string }
  repository: string
  sourceDirectories: string[]
}

const root = process.cwd()
const upstream = JSON.parse(
  readFileSync(resolve(root, 'wasm/vital/UPSTREAM.json'), 'utf8'),
) as UpstreamRecord
const notice = readFileSync(resolve(root, 'NOTICE'), 'utf8')
const packageDocument = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  license?: string
}

describe('Vital distribution metadata', () => {
  it('keeps the project license and complete upstream record aligned with NOTICE', () => {
    expect(packageDocument.license).toBe(upstream.license.spdx)
    expect(readFileSync(resolve(root, 'LICENSE'), 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(notice).toContain(upstream.repository)
    expect(notice).toContain(upstream.commit)
    expect(notice).toContain(upstream.license.spdx)

    for (const sourceDirectory of upstream.sourceDirectories) {
      expect(notice).toContain(`- ${sourceDirectory}`)
    }
    for (const juceModule of upstream.juceModules) {
      expect(notice).toContain(`- ${juceModule}`)
    }
    for (const patch of upstream.appliedPatches) {
      expect(notice).toContain(`- wasm/vital/${patch}`)
    }
  })

  it('lists every and only checked-in upstream patch', () => {
    const checkedInPatches = readdirSync(resolve(root, 'wasm/vital/patches'))
      .filter((filename) => filename.endsWith('.patch'))
      .sort()
    const recordedPatches = upstream.appliedPatches.map((patch) => basename(patch)).sort()

    expect(recordedPatches).toEqual(checkedInPatches)
  })

  it('documents the pinned toolchain and corresponding-source commands', () => {
    const buildInstructions = readFileSync(resolve(root, 'wasm/vital/README.md'), 'utf8')
    const sourceFetcher = readFileSync(resolve(root, 'wasm/vital/fetch-source.sh'), 'utf8')

    expect(buildInstructions).toContain('emsdk `3.1.64`')
    expect(buildInstructions).toContain('bash wasm/vital/fetch-source.sh')
    expect(buildInstructions).toContain('bash wasm/vital/build.sh')
    expect(sourceFetcher).toContain(upstream.repository)
    expect(sourceFetcher).toContain(upstream.commit)
  })
})
