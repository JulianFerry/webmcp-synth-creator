import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { BrowserSynth, type BrowserSynthState } from '../audio/BrowserSynth'
import { CommandService } from '../commands/CommandService'
import type { SupportedPatchPath } from '../patch/paths'
import { summarizePatch } from '../patch/summary'
import type { PatchState, PatchSummary } from '../patch/types'
import { SessionService, type VariantId } from '../session/SessionService'
import { vitalFilename, VitalPresetAdapter } from '../vital/VitalPresetAdapter'

export type CapabilityStatus = 'checking' | 'available' | 'unavailable'
export type VitalFixtureStatus = 'loading' | 'ready' | 'missing'

export interface AppStoreState {
  patch: PatchState
  summary: PatchSummary
  changed: Record<string, { before: unknown; after: unknown }>
  currentVariant: VariantId
  hasVariantB: boolean
  canUndo: boolean
  canRedo: boolean
  audio: BrowserSynthState
  webMcpStatus: CapabilityStatus
  webMcpReason: string | null
  vitalStatus: VitalFixtureStatus
  vitalError: string | null
  exportFilename: string
  lastError: string | null
  transactionCount: number
  historySize: number
  futureSize: number
  controlResetKey: number
  applyDarker: () => void
  applyPatchChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  previewPatchChange: (path: SupportedPatchPath, value: unknown) => void
  cancelPatchPreview: (path: SupportedPatchPath) => void
  startAudio: () => Promise<void>
  noteOn: (midi: number, velocity?: number) => Promise<void>
  noteOff: (midi: number) => void
  releaseAllNotes: () => void
  toggleHeldNote: () => Promise<void>
  createVariant: () => void
  selectVariant: (variantId: VariantId) => void
  undo: () => void
  redo: () => void
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

function variantBName(name: string): string {
  const suffix = name.endsWith(' [B]') ? ' [B2]' : ' [B]'
  return `${name.slice(0, 80 - suffix.length)}${suffix}`
}

export function createAppStore({ session, commands, synth }: AppStoreDependencies): AppStore {
  let vitalAdapter: VitalPresetAdapter | null = null
  const initialPatch = session.getPatch()
  const initialSession = session.getSummary()

  const store = create<AppStoreState>((set, get) => ({
    patch: initialPatch,
    summary: summarizePatch(initialPatch),
    changed: {},
    currentVariant: initialSession.currentVariant,
    hasVariantB: initialSession.hasVariantB,
    canUndo: initialSession.canUndo,
    canRedo: initialSession.canRedo,
    audio: synth.getState(),
    webMcpStatus: 'checking',
    webMcpReason: null,
    vitalStatus: 'loading',
    vitalError: null,
    exportFilename: vitalFilename(initialPatch.metadata.name),
    lastError: null,
    transactionCount: 0,
    historySize: commands.historySize,
    futureSize: commands.futureSize,
    controlResetKey: 0,

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

    applyPatchChange: (path, value, reason) => {
      try {
        commands.applyPatch(
          {
            type: 'apply_patch',
            reason,
            changes: [{ path, value }],
          },
          { source: 'ui' },
        )
        return true
      } catch (error) {
        synth.cancelAllPatchPreviews()
        set((state) => ({
          controlResetKey: state.controlResetKey + 1,
          lastError: errorMessage(error),
        }))
        return false
      }
    },

    previewPatchChange: (path, value) => {
      try {
        synth.previewPatchChange(path, value)
        set({ lastError: null })
      } catch (error) {
        synth.cancelAllPatchPreviews()
        set((state) => ({
          controlResetKey: state.controlResetKey + 1,
          lastError: errorMessage(error),
        }))
      }
    },

    cancelPatchPreview: (path) => {
      synth.cancelPatchPreview(path)
    },

    startAudio: async () => {
      try {
        await synth.startAudio()
        set({ lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    noteOn: async (midi, velocity = 0.85) => {
      try {
        await synth.noteOn(midi, velocity)
        set({ lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    noteOff: (midi) => synth.noteOff(midi),

    releaseAllNotes: () => synth.releaseAllNotes(),

    toggleHeldNote: async () => {
      try {
        await synth.toggleHeldNote()
        set({ lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    createVariant: () => {
      const current = session.getPatch()
      const changes: Array<{ path: SupportedPatchPath; value: unknown }> = [
        { path: 'metadata.name', value: variantBName(current.metadata.name) },
      ]
      current.oscillators.forEach((oscillator, index) => {
        const wider = Math.min(1, Number((oscillator.stereoSpread + 0.12).toFixed(2)))
        if (wider !== oscillator.stereoSpread) {
          changes.push({
            path: `oscillators.${index}.stereoSpread` as SupportedPatchPath,
            value: wider,
          })
        }
      })

      try {
        commands.createVariant(
          {
            type: 'create_variant',
            reason: 'Create a wider B alternative from the selected patch',
            changes,
          },
          { source: 'ui' },
        )
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    selectVariant: (variantId) => {
      try {
        commands.selectVariant(variantId, { source: 'ui' })
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

    redo: () => {
      try {
        commands.redo({ source: 'history' })
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
    const sessionSummary = session.getSummary()
    const isPatchTransaction = ['command', 'undo', 'redo', 'variant_create'].includes(event.kind)
    store.setState((state) => ({
      patch: event.patch,
      summary: summarizePatch(event.patch),
      changed:
        event.kind === 'variant_select' || event.kind === 'variant_discard'
          ? {}
          : event.changed,
      currentVariant: sessionSummary.currentVariant,
      hasVariantB: sessionSummary.hasVariantB,
      canUndo: sessionSummary.canUndo,
      canRedo: sessionSummary.canRedo,
      transactionCount: state.transactionCount + (isPatchTransaction ? 1 : 0),
      historySize: commands.historySize,
      futureSize: commands.futureSize,
      controlResetKey: state.controlResetKey + 1,
      exportFilename: vitalFilename(event.patch.metadata.name),
      lastError: null,
    }))
  })
  synth.subscribe((audio) => store.setState({ audio }))

  return store
}
