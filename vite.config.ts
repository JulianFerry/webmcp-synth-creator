import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const VIRTUAL_VITAL_MODULE_ID = 'virtual:vital-wasm-module'
const RESOLVED_VIRTUAL_VITAL_MODULE_ID = `\0${VIRTUAL_VITAL_MODULE_ID}`
const VITAL_BUILD_DIRECTORY = resolve('wasm/vital/build')
const VITAL_ASSET_URL_PREFIX = '/wasm/vital/build/'

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

function vitalWasmAssets(): Plugin {
  return {
    name: 'vital-wasm-assets',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_VITAL_MODULE_ID) return RESOLVED_VIRTUAL_VITAL_MODULE_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_VITAL_MODULE_ID) return

      const modulePath = resolve(VITAL_BUILD_DIRECTORY, 'vital.mjs')
      if (existsSync(modulePath)) return readFileSync(modulePath, 'utf8')
      return 'export default async function createVitalModule() { throw new Error("Vital WASM artifact is unavailable") }'
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith(VITAL_ASSET_URL_PREFIX)) {
          next()
          return
        }

        const filename = pathname.slice(VITAL_ASSET_URL_PREFIX.length)
        if (filename !== 'vital.mjs' && filename !== 'vital.wasm') {
          next()
          return
        }

        const source = resolve(VITAL_BUILD_DIRECTORY, filename)
        if (!existsSync(source)) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader(
          'Content-Type',
          filename.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8',
        )
        createReadStream(source).pipe(response)
      })
    },
    closeBundle() {
      for (const filename of ['vital.mjs', 'vital.wasm']) {
        const source = resolve(VITAL_BUILD_DIRECTORY, filename)
        if (!existsSync(source)) continue

        const destination = resolve('dist/wasm/vital/build', filename)
        mkdirSync(dirname(destination), { recursive: true })
        copyFileSync(source, destination)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), vitalWasmAssets(), copyLocalVitalFixture()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
