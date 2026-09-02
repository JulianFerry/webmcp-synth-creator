import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const script = resolve(root, 'wasm/vital/setup.sh')

function runSetup(...args: string[]) {
  return spawnSync('bash', [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      EMSDK_DIR: '/tmp/wavetable-workbench-test-emsdk',
      EMSDK_VERSION: '3.1.64',
    },
  })
}

describe('Vital first-time setup', () => {
  it('plans the complete pinned setup and production build in order', () => {
    const result = runSetup('--dry-run')

    expect(result.status, result.stderr).toBe(0)
    const output = result.stdout
    const expectedSteps = [
      'git clone https://github.com/emscripten-core/emsdk.git',
      'emsdk install 3.1.64',
      'emsdk activate 3.1.64',
      'emsdk_env.sh',
      'npm --prefix',
      'ci',
      'fetch-source.sh',
      'build.sh',
      'run build',
    ]
    let previousIndex = -1
    for (const step of expectedSteps) {
      const index = output.indexOf(step)
      expect(index, `Missing setup step: ${step}`).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
  })

  it('documents the setup scope and environment overrides', () => {
    const result = runSetup('--help')

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Perform first-time setup')
    expect(result.stdout).toContain('EMSDK_DIR')
    expect(result.stdout).toContain('EMSDK_VERSION')
  })

  it('rejects unknown options', () => {
    const result = runSetup('--unknown')

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Unknown option: --unknown')
  })
})
