import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { BrowserSynth, type BrowserSynthState } from '../audio/BrowserSynth'
import { CommandService } from '../commands/CommandService'
import { summarizePatch } from '../patch/summary'
import type { PatchState, PatchSummary } from '../patch/types'
import { SessionService } from '../session/SessionService'
import { vitalFilename, VitalPresetAdapter } from '../vital/VitalPresetAdapter'

export type CapabilityStatus = 'checking' | 'available' | 'unavailable'
export type VitalFixtureStatus = 'loading' | 'ready' | 'missing'

export interface AppStoreState {
  patch: PatchState
  summary: PatchSummary
  changed: Record<string, { before: unknown; after: unknown }>
  canUndo: boolean
  audio: BrowserSynthState
  webMcpStatus: CapabilityStatus
  webMcpReason: string | null
  vitalStatus: VitalFixtureStatus
  vitalError: string | null
  exportFilename: string
  lastError: string | null
  applyDarker: () => void
  toggleHeldNote: () => Promise<void>
  undo: () => void
  exportVital: () => void
  setWebMcpCapability: (status: CapabilityStatus, reason?: string) => void
  setVitalAdapter: (adapter: VitalPresetAdapter | null, error?: string) => void
}

export type AppStore = UseBoundStore<StoreApi<AppStoreState>>

interface AppStoreDependencies {
  session: SessionService
  commands: CommandService
  synth: BrowserSynth
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export function createAppStore({ session, commands, synth }: AppStoreDependencies): AppStore {
  let vitalAdapter: VitalPresetAdapter | null = null
  const initialPatch = session.getPatch()

  const store = create<AppStoreState>((set, get) => ({
    patch: initialPatch,
    summary: summarizePatch(initialPatch),
    changed: {},
    canUndo: commands.canUndo,
    audio: synth.getState(),
    webMcpStatus: 'checking',
    webMcpReason: null,
    vitalStatus: 'loading',
    vitalError: null,
    exportFilename: vitalFilename(initialPatch.metadata.name),
    lastError: null,

    applyDarker: () => {
      const current = session.getPatch()
      try {
        commands.applyPatch(
          {
            type: 'apply_patch',
            reason: 'Lower the filter cutoff while preserving the airy wavetable character',
            changes: [
              {
                path: 'filter.cutoffHz',
                value: Math.max(20, Math.round(current.filter.cutoffHz * 0.72)),
              },
            ],
          },
          { source: 'ui' },
        )
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    toggleHeldNote: async () => {
      try {
        await synth.toggleHeldNote()
        set({ lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    undo: () => {
      try {
        commands.undo({ source: 'history' })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    exportVital: () => {
      if (!vitalAdapter) {
        set({ lastError: get().vitalError ?? 'The Vital Init fixture is unavailable' })
        return
      }
      try {
        const filename = vitalAdapter.downloadPatch(session.getPatch())
        set({ exportFilename: filename, lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    setWebMcpCapability: (status, reason) => {
      set({ webMcpStatus: status, webMcpReason: reason ?? null })
    },

    setVitalAdapter: (adapter, error) => {
      vitalAdapter = adapter
      set({
        vitalStatus: adapter ? 'ready' : 'missing',
        vitalError: error ?? null,
      })
    },
  }))

  session.subscribe((event) => {
    store.setState({
      patch: event.patch,
      summary: summarizePatch(event.patch),
      changed: event.changed,
      canUndo: commands.canUndo,
      exportFilename: vitalFilename(event.patch.metadata.name),
      lastError: null,
    })
  })
  synth.subscribe((audio) => store.setState({ audio }))

  return store
}
