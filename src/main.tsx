import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { createAppStore } from './app/appStore'
import './app/styles.css'
import { BrowserSynth } from './audio/BrowserSynth'
import { CommandService } from './commands/CommandService'
import { latencyTrace } from './dev/latencyTrace'
import { createDefaultPatch } from './patch/defaults'
import { SessionService } from './session/SessionService'
import { VitalPresetAdapter } from './vital/VitalPresetAdapter'
import { createModelContextGateway } from './webmcp/ModelContextGateway'
import { registerTools, type ToolRegistration } from './webmcp/registerTools'

const session = new SessionService(createDefaultPatch())
const synth = new BrowserSynth(session, latencyTrace)
const commands = new CommandService(session, undefined, latencyTrace)
const store = createAppStore({ session, commands, synth })

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Application root was not found')
createRoot(rootElement).render(<App store={store} />)

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

  const vitalPromise = VitalPresetAdapter.fromUrl()
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
    synth.dispose()
  },
  { once: true },
)
