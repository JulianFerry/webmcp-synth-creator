import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { SynthRenderer, SynthRendererState } from '../audio/SynthRenderer'
import { CommandService } from '../commands/CommandService'
import type { RequestSource } from '../dev/latencyTrace'
import type { SupportedPatchPath } from '../patch/paths'
import { summarizePatch } from '../patch/summary'
import type { PatchState, PatchSummary } from '../patch/types'
import {
  findMatchingPresetId,
  listPresets,
  type CuratedPresetSummary,
} from '../presets/registry'
import { SessionService, type VariantId } from '../session/SessionService'
import { readVitalImportFile } from '../vital/importFile'
import { vitalFilename, VitalPresetAdapter } from '../vital/VitalPresetAdapter'

export type CapabilityStatus = 'checking' | 'available' | 'unavailable'
export type VitalFixtureStatus = 'loading' | 'ready' | 'missing'

export interface AppStoreState {
  patch: PatchState
  summary: PatchSummary
  changed: Record<string, { before: unknown; after: unknown }>
  lastTransactionReason: string | null
  lastTransactionSource: RequestSource | null
  presets: CuratedPresetSummary[]
  currentPresetId: string | null
  currentVariant: VariantId
  hasVariantB: boolean
  canUndo: boolean
  canRedo: boolean
  audio: SynthRendererState
  audioPreparationError: string | null
  webMcpStatus: CapabilityStatus
  webMcpReason: string | null
  vitalStatus: VitalFixtureStatus
  vitalError: string | null
  exportFilename: string
  lastError: string | null
  vitalImportNotice: string | null
  transactionCount: number
  historySize: number
  futureSize: number
  controlResetKey: number
  applyDarker: () => void
  applyPatchChange: (path: SupportedPatchPath, value: unknown, reason: string) => boolean
  previewPatchChange: (path: SupportedPatchPath, value: unknown) => void
  cancelPatchPreview: (path: SupportedPatchPath) => void
  startAudio: () => Promise<void>
  noteOn: (midi: number, velocity?: number, requestedAtMs?: number) => Promise<void>
  noteOff: (midi: number) => void
  releaseAllNotes: () => void
  toggleHeldNote: (requestedAtMs?: number) => Promise<void>
  createVariant: () => void
  loadPreset: (presetId: string) => void
  importVitalFile: (file: File) => Promise<void>
  selectVariant: (variantId: VariantId) => void
  undo: () => void
  redo: () => void
  exportVital: () => void
  setAudioPreparationError: (message: string) => void
  setWebMcpCapability: (status: CapabilityStatus, reason?: string) => void
  setVitalAdapter: (adapter: VitalPresetAdapter | null, error?: string) => void
}

export type AppStore = UseBoundStore<StoreApi<AppStoreState>>

interface AppStoreDependencies {
  session: SessionService
  commands: CommandService
  synth: SynthRenderer
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

function variantBName(name: string): string {
  const suffix = name.endsWith(' [B]') ? ' [B2]' : ' [B]'
  return `${name.slice(0, 80 - suffix.length)}${suffix}`
}

function vitalImportNotice(info: ReturnType<SessionService['getVitalBackingInfo']>): string | null {
  if (info === null) return null
  const details = []
  if (info.hiddenEffects.length > 0) {
    details.push(`Hidden effects: ${info.hiddenEffects.join(', ')}.`)
  }
  if (info.affectedControls.length > 0) {
    const controls = info.affectedControls
      .map(({ control, sources }) => `${control} (${sources.join(', ')})`)
      .join(', ')
    details.push(`Controls that may not behave as shown: ${controls}.`)
  }
  return details.length > 0 ? details.join(' ') : null
}

export function createAppStore({ session, commands, synth }: AppStoreDependencies): AppStore {
  let vitalAdapter: VitalPresetAdapter | null = null
  const initialPatch = session.getPatch()
  const initialSession = session.getSummary()

  const store = create<AppStoreState>((set, get) => ({
    patch: initialPatch,
    summary: summarizePatch(initialPatch),
    changed: {},
    lastTransactionReason: null,
    lastTransactionSource: null,
    presets: listPresets(),
    currentPresetId: findMatchingPresetId(initialPatch),
    currentVariant: initialSession.currentVariant,
    hasVariantB: initialSession.hasVariantB,
    canUndo: initialSession.canUndo,
    canRedo: initialSession.canRedo,
    audio: synth.getState(),
    audioPreparationError: null,
    webMcpStatus: 'checking',
    webMcpReason: null,
    vitalStatus: 'loading',
    vitalError: null,
    exportFilename: vitalFilename(initialPatch.metadata.name),
    lastError: null,
    vitalImportNotice: null,
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

    noteOn: async (midi, velocity = 0.85, requestedAtMs) => {
      try {
        await synth.noteOn(midi, velocity, requestedAtMs)
        set({ lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    noteOff: (midi) => synth.noteOff(midi),

    releaseAllNotes: () => synth.releaseAllNotes(),

    toggleHeldNote: async (requestedAtMs) => {
      try {
        await synth.toggleHeldNote(requestedAtMs)
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
            comparisonAxis: 'stereo width',
            changes,
          },
          { source: 'ui' },
        )
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    loadPreset: (presetId) => {
      try {
        commands.loadPreset({ type: 'load_preset', presetId }, { source: 'ui' })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    importVitalFile: async (file) => {
      if (!vitalAdapter) {
        set({ lastError: get().vitalError ?? 'The Vital compatibility fixture is unavailable' })
        return
      }

      try {
        const importedFile = await readVitalImportFile(file)
        const imported = vitalAdapter.importPatch(importedFile.document, {
          originalJson: importedFile.originalJson,
          sourceFilename: file.name,
        })
        commands.createPatch(
          {
            type: 'create_patch',
            reason: `Import Vital preset: ${file.name}`,
            patch: imported.patch,
          },
          { source: 'ui' },
          imported.backing,
        )
        set({
          lastError: null,
          vitalImportNotice: vitalImportNotice(session.getVitalBackingInfo()),
        })
      } catch (error) {
        set({ lastError: errorMessage(error), vitalImportNotice: null })
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
        const filename = vitalAdapter.downloadPatch(
          session.getPatch(),
          session.getVitalBacking(),
        )
        set({ exportFilename: filename, lastError: null })
      } catch (error) {
        set({ lastError: errorMessage(error) })
      }
    },

    setAudioPreparationError: (message) => {
      set({ audioPreparationError: message })
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
    const isPatchTransaction = [
      'command',
      'patch_create',
      'preset_load',
      'undo',
      'redo',
      'variant_create',
    ].includes(event.kind)
    store.setState((state) => ({
      patch: event.patch,
      summary: summarizePatch(event.patch),
      currentPresetId: findMatchingPresetId(event.patch),
      changed:
        event.kind === 'variant_select' || event.kind === 'variant_discard'
          ? {}
          : event.changed,
      lastTransactionReason:
        event.kind === 'variant_select' || event.kind === 'variant_discard' ? null : event.reason,
      lastTransactionSource:
        event.kind === 'variant_select' || event.kind === 'variant_discard' ? null : event.source,
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
      vitalImportNotice: vitalImportNotice(session.getVitalBackingInfo()),
    }))
  })
  synth.subscribe((audio) => store.setState({ audio }))

  return store
}
