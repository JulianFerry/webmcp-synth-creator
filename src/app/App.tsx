import { useState } from 'react'

import type { SessionService } from '../session/SessionService'
import { AuditionPanel } from '../ui/AuditionPanel'
import { WorkbenchShell } from '../ui/WorkbenchShell'
import { TelemetryRegion } from '../ui/shell/DiagnosticDrawer'
import { VariantComparisonSidebar } from '../ui/shell/VariantComparisonSidebar'
import { WorkbenchTabs } from '../ui/shell/WorkbenchTabs'
import { ModulationEffectsTab } from '../ui/tabs/ModulationEffectsTab'
import { OscillatorsTab } from '../ui/tabs/OscillatorsTab'
import { HelpSystem, HelpToolbar, type HelpEntryPoint } from '../ui/help/HelpSystem'
import type { AppStore } from './appStore'
import type { WorkbenchTab } from './uiState'

interface AppProps {
  store: AppStore
  session?: SessionService
}

export function App({ store, session = undefined }: AppProps) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('oscillators')
  const [helpEntryPoint, setHelpEntryPoint] = useState<HelpEntryPoint>(null)
  const state = store()
  const { patch, audio } = state
  const wavetables = Object.values(patch.wavetableData)
  const oscillators = patch.oscillators.map((oscillator, index) => ({
    index: index as 0 | 1 | 2,
    oscillator,
    onCancelPreview: state.cancelPatchPreview,
    onChange: state.applyPatchChange,
    onPreview: state.previewPatchChange,
    previewPosition: audio.draft.oscillators[index].wavetablePosition,
    resetKey: state.controlResetKey,
    wavetables,
  }))
  const lfos = [
    { slot: 1 as const, lfo: patch.lfo1, onChange: state.applyPatchChange, resetKey: state.controlResetKey },
    { slot: 2 as const, lfo: patch.lfo2, onChange: state.applyPatchChange, resetKey: state.controlResetKey },
  ] as const
  const envelope = { envelope: patch.ampEnvelope, onCancelPreview: state.cancelPatchPreview, onChange: state.applyPatchChange, onPreview: state.previewPatchChange, previewEnvelope: audio.draft.ampEnvelope, resetKey: state.controlResetKey }
  const audition = { audio, onNoteOff: state.noteOff, onNoteOn: state.noteOn, onReleaseAll: state.releaseAllNotes }

  const history = { canRedo: state.canRedo, canUndo: state.canUndo, onRedo: state.redo, onUndo: state.undo }
  const sessionState = session?.getState()
  const sidebar = <VariantComparisonSidebar
    patches={{ A: sessionState?.variants.A.present ?? patch, B: sessionState?.variants.B?.present ?? null }}
    transfer={{ currentPresetId: state.currentPresetId, exportFilename: state.exportFilename, onExport: state.exportVital, onImport: state.importVitalFile, onLoadPreset: state.loadPreset, presets: state.presets, summary: state.summary, vitalStatus: state.vitalStatus }}
    variant={{ currentVariant: state.currentVariant, hasVariantB: state.hasVariantB, onCreateVariant: state.createVariant, onSelectVariant: state.selectVariant }}
  />
  const telemetry = <TelemetryRegion applyDarker={state.applyDarker} audio={audio} canRedo={state.canRedo} canUndo={state.canUndo} changed={state.changed} currentVariant={state.currentVariant} futureSize={state.futureSize} historySize={state.historySize} patch={patch} reason={state.lastTransactionReason} summary={state.summary} transactionCount={state.transactionCount} vitalError={state.vitalError} vitalStatus={state.vitalStatus} webMcpReason={state.webMcpReason} webMcpStatus={state.webMcpStatus} />
  const visibleError = state.audioPreparationError ?? state.lastError
  const notices = <>{state.vitalImportNotice ? <div className="notice-banner" data-testid="vital-import-notice" role="status">{state.vitalImportNotice}</div> : null}{visibleError ? <div className="error-banner" data-testid={state.audioPreparationError ? 'audio-preparation-error' : undefined} role="alert">{visibleError}</div> : null}</>

  return <WorkbenchShell footer={<AuditionPanel {...audition} />} notices={notices} patchVariant={state.currentVariant} sidebar={sidebar} telemetry={telemetry}>
    <WorkbenchTabs
      active={activeTab}
      assistance={<HelpToolbar entryPoint={helpEntryPoint} onChange={setHelpEntryPoint} />}
      history={history}
      onChange={setActiveTab}
    >
      {activeTab === 'oscillators' ? <OscillatorsTab envelope={envelope} lfos={[...lfos]} oscillators={oscillators} /> : null}
      {activeTab === 'modulation-effects' ? <ModulationEffectsTab audio={audio} patch={patch} resetKey={state.controlResetKey} onCancelPreview={state.cancelPatchPreview} onChange={state.applyPatchChange} onPreview={state.previewPatchChange} /> : null}
    </WorkbenchTabs>
    <HelpSystem activeTab={activeTab} entryPoint={helpEntryPoint} onChangeTab={setActiveTab} onClose={() => setHelpEntryPoint(null)} />
  </WorkbenchShell>
}
