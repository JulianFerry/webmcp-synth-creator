import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function copyLocalVitalFixture(): Plugin {
  return {
    name: 'copy-local-vital-fixture',
    closeBundle() {
      const source = resolve('fixtures/vital/init.vital')
      if (!existsSync(source)) return

      const destination = resolve('dist/fixtures/vital/init.vital')
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(source, destination)
    },
  }
}

export default defineConfig({
  plugins: [react(), copyLocalVitalFixture()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
