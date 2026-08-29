import { useState } from 'react'

import { WorkbenchShell } from '../ui/WorkbenchShell'
import { DiagnosticDrawer } from '../ui/shell/DiagnosticDrawer'
import { GlobalPatchBar } from '../ui/shell/GlobalPatchBar'
import { LastChangeIndicator } from '../ui/shell/LastChangeIndicator'
import { WorkbenchTabs } from '../ui/shell/WorkbenchTabs'
import { ModulationEffectsTab } from '../ui/tabs/ModulationEffectsTab'
import { OscillatorsTab } from '../ui/tabs/OscillatorsTab'
import { OverviewTab } from '../ui/tabs/OverviewTab'
import type { AppStore } from './appStore'
import type { WorkbenchTab } from './uiState'

interface AppProps { store: AppStore }

export function App({ store }: AppProps) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('overview')
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
  const lfo = { lfo: patch.lfo1, onChange: state.applyPatchChange, resetKey: state.controlResetKey }
  const envelope = { envelope: patch.ampEnvelope, onCancelPreview: state.cancelPatchPreview, onChange: state.applyPatchChange, onPreview: state.previewPatchChange, previewEnvelope: audio.draft.ampEnvelope, resetKey: state.controlResetKey }
  const filter = { filter: patch.filter, onCancelPreview: state.cancelPatchPreview, onChange: state.applyPatchChange, onPreview: state.previewPatchChange, previewFilter: audio.draft.filter, resetKey: state.controlResetKey }
  const audition = { audio, onCancelPreview: state.cancelPatchPreview, onChange: state.applyPatchChange, onNoteOff: state.noteOff, onNoteOn: state.noteOn, onPreview: state.previewPatchChange, onReleaseAll: state.releaseAllNotes, onStartAudio: state.startAudio, onToggleHeldNote: state.toggleHeldNote, resetKey: state.controlResetKey, voice: patch.voice }

  const bar = <GlobalPatchBar
    LastChange={LastChangeIndicator}
    activeVoiceCount={audio.activeVoiceCount}
    audioLifecycle={audio.lifecycle}
    header={{ currentPresetId: state.currentPresetId, exportFilename: state.exportFilename, onExport: state.exportVital, onImport: state.importVitalFile, onLoadPreset: state.loadPreset, presets: state.presets, summary: state.summary, vitalStatus: state.vitalStatus }}
    history={{ canRedo: state.canRedo, canUndo: state.canUndo, futureSize: state.futureSize, historySize: state.historySize, onRedo: state.redo, onUndo: state.undo }}
    lastChange={{ changedPaths: Object.keys(state.changed), onJump: setActiveTab, reason: state.lastTransactionReason, source: state.lastTransactionSource }}
    variant={{ currentVariant: state.currentVariant, hasVariantB: state.hasVariantB, onCreateVariant: state.createVariant, onSelectVariant: state.selectVariant }}
  />
  const diagnostics = import.meta.env.DEV ? <DiagnosticDrawer applyDarker={state.applyDarker} audio={audio} canRedo={state.canRedo} canUndo={state.canUndo} changed={state.changed} currentVariant={state.currentVariant} futureSize={state.futureSize} historySize={state.historySize} patch={patch} reason={state.lastTransactionReason} summary={state.summary} transactionCount={state.transactionCount} vitalError={state.vitalError} vitalStatus={state.vitalStatus} webMcpReason={state.webMcpReason} webMcpStatus={state.webMcpStatus} /> : null
  const notices = <>{state.vitalImportNotice ? <div className="notice-banner" data-testid="vital-import-notice" role="status">{state.vitalImportNotice}</div> : null}{state.lastError ? <div className="error-banner" role="alert">{state.lastError}</div> : null}</>

  return <WorkbenchShell bar={bar} diagnostics={diagnostics} notices={notices}>
    <WorkbenchTabs active={activeTab} onChange={setActiveTab}>
      {activeTab === 'overview' ? <OverviewTab audition={audition} envelope={envelope} lfo={lfo} oscillators={oscillators} /> : null}
      {activeTab === 'oscillators' ? <OscillatorsTab oscillators={oscillators} /> : null}
      {activeTab === 'modulation-effects' ? <ModulationEffectsTab effects={{ effects: patch.effects, onChange: state.applyPatchChange, resetKey: state.controlResetKey }} filter={filter} lfo={lfo} modulation={{ envelope: patch.modEnvelope, modulations: patch.modulations, onChange: state.applyPatchChange, resetKey: state.controlResetKey }} /> : null}
    </WorkbenchTabs>
  </WorkbenchShell>
}
