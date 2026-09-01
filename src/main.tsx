import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { createAppStore } from './app/appStore'
import './app/styles.css'
import { VitalWasmRenderer } from './audio/vital/VitalWasmRenderer'
import { CommandService } from './commands/CommandService'
import { latencyTrace } from './dev/latencyTrace'
import { createDefaultPatch } from './patch/defaults'
import { SessionService } from './session/SessionService'
import { VitalPresetAdapter } from './vital/VitalPresetAdapter'
import { createModelContextGateway } from './webmcp/ModelContextGateway'
import { registerTools, type ToolRegistration } from './webmcp/registerTools'

const session = new SessionService(createDefaultPatch())
const vitalAdapterPromise = Promise.resolve().then(() => VitalPresetAdapter.fromUrl())
const renderer = new VitalWasmRenderer(session, vitalAdapterPromise, latencyTrace)
const commands = new CommandService(session, undefined, latencyTrace)
const store = createAppStore({ session, commands, synth: renderer })

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Application root was not found')
createRoot(rootElement).render(<App store={store} />)

void renderer.prepare().catch(() => undefined)

if (import.meta.env.DEV) {
  void import('./audio/vital/devHarness').then(({ installVitalDevHarness }) => {
    installVitalDevHarness()
  })
}

let registration: ToolRegistration | null = null

async function initializeAdapters(): Promise<void> {
  const registrationPromise = registerTools(createModelContextGateway(), session, commands)
    .then((result) => {
      registration = result
      store.getState().setWebMcpCapability(result.status, result.reason)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'WebMCP registration failed'
      store.getState().setWebMcpCapability('unavailable', message)
    })

  const vitalPromise = vitalAdapterPromise
    .then((adapter) => store.getState().setVitalAdapter(adapter))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Vital Init fixture is unavailable'
      store.getState().setVitalAdapter(null, message)
    })

  await Promise.all([registrationPromise, vitalPromise])
}

void initializeAdapters()

window.addEventListener(
  'pagehide',
  () => {
    registration?.dispose()
    renderer.dispose()
  },
  { once: true },
)
