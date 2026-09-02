import {
  CALIBRATION_A_PATCH,
  CALIBRATION_B_PATCH,
  CALIBRATION_C_PATCH,
  CALIBRATION_D_PATCH,
  CALIBRATION_E_PATCH,
  CALIBRATION_F_PATCH,
  CALIBRATION_G_PATCH,
  CALIBRATION_H_PATCH,
} from '../../presets/patches/calibration'
import type { PatchState } from '../../patch/types'
import { VitalPresetAdapter } from '../../vital/VitalPresetAdapter'
import type { VitalWorkletEvent } from './protocol'
import { vitalEnginePayload } from './state'
import { VitalWorkletHost } from './VitalWorkletHost'

const CALIBRATION_PATCHES = {
  a: CALIBRATION_A_PATCH,
  b: CALIBRATION_B_PATCH,
  c: CALIBRATION_C_PATCH,
  d: CALIBRATION_D_PATCH,
  e: CALIBRATION_E_PATCH,
  f: CALIBRATION_F_PATCH,
  g: CALIBRATION_G_PATCH,
  h: CALIBRATION_H_PATCH,
} satisfies Record<string, PatchState>

export type VitalCalibrationId = keyof typeof CALIBRATION_PATCHES

export interface VitalHarnessStats {
  appliedRevisions: number[]
  contextState: AudioContextState | 'uninitialized'
  errors: Array<{ phase: string; message: string }>
  renderStats: Array<{
    averageBlockMs: number
    blockMs: number
    blocks: number
    overruns: number
  }>
  sampleRate: number | null
}

export interface VitalDevHarness {
  allNotesOff(): Promise<void>
  dispose(): Promise<void>
  getStats(): VitalHarnessStats
  loadCalibration(id: VitalCalibrationId): Promise<number>
  loadState(json: string): Promise<number>
  play(note?: number, velocity?: number): Promise<void>
  prepare(): Promise<void>
  stop(note?: number): Promise<void>
}

declare global {
  interface Window {
    __VITAL_HARNESS__?: VitalDevHarness
  }
}

class BrowserVitalDevHarness implements VitalDevHarness {
  private adapter: VitalPresetAdapter | null = null
  private appliedRevisions: number[] = []
  private context: AudioContext | null = null
  private errors: Array<{ phase: string; message: string }> = []
  private host: VitalWorkletHost | null = null
  private preparePromise: Promise<void> | null = null
  private renderStats: VitalHarnessStats['renderStats'] = []
  private revision = 0
  private sampleRate: number | null = null

  prepare(): Promise<void> {
    this.preparePromise ??= this.initialize()
    return this.preparePromise
  }

  async play(note = 60, velocity = 100 / 127): Promise<void> {
    await this.prepare()
    await this.resumeContext()
    this.requireHost().noteOn(note, velocity)
  }

  async stop(note?: number): Promise<void> {
    await this.prepare()
    if (note === undefined) this.requireHost().allNotesOff()
    else this.requireHost().noteOff(note)
  }

  async allNotesOff(): Promise<void> {
    await this.prepare()
    this.requireHost().allNotesOff()
  }

  async loadCalibration(id: VitalCalibrationId): Promise<number> {
    await this.prepare()
    const patch = CALIBRATION_PATCHES[id]
    if (patch === undefined) throw new RangeError(`Unknown Vital calibration patch: ${id}`)
    return this.applyState(vitalEnginePayload(this.requireAdapter(), patch))
  }

  async loadState(json: string): Promise<number> {
    await this.prepare()
    return this.applyState(json)
  }

  getStats(): VitalHarnessStats {
    return {
      appliedRevisions: [...this.appliedRevisions],
      contextState: this.context?.state ?? 'uninitialized',
      errors: this.errors.map((error) => ({ ...error })),
      renderStats: this.renderStats.map((stats) => ({ ...stats })),
      sampleRate: this.sampleRate,
    }
  }

  async dispose(): Promise<void> {
    this.host?.dispose()
    this.host = null
    if (this.context !== null && this.context.state !== 'closed') await this.context.close()
    this.context = null
    this.adapter = null
    this.preparePromise = null
  }

  resumeFromGesture(): void {
    if (this.context?.state === 'suspended') void this.context.resume()
  }

  private async initialize(): Promise<void> {
    const context = new AudioContext({ latencyHint: 'interactive' })
    const host = new VitalWorkletHost(context)
    this.context = context
    this.host = host
    host.subscribe((event) => this.recordEvent(event))

    const adapter = await VitalPresetAdapter.fromUrl()
    this.adapter = adapter
    host.setBpm(120)
    this.applyState(vitalEnginePayload(adapter, CALIBRATION_A_PATCH))
    // Start the output device before the worklet initializes so that the first note is not also
    // the moment the device stream starts. `play()` resumes again for the no-gesture-yet case.
    await this.resumeContext()
    await host.prepare()
    if (this.context !== context || this.host !== host) {
      host.dispose()
      throw new Error('Vital development harness was disposed during initialization')
    }
  }

  private async resumeContext(): Promise<void> {
    const context = this.context
    if (context === null || context.state !== 'suspended') return
    // Autoplay policy rejects this until the page has seen a gesture; `resumeFromGesture` retries.
    await context.resume().catch(() => undefined)
  }

  private applyState(json: string): number {
    this.revision += 1
    this.requireHost().loadState(this.revision, json)
    return this.revision
  }

  private recordEvent(event: VitalWorkletEvent): void {
    switch (event.type) {
      case 'ready':
        this.sampleRate = event.sampleRate
        break
      case 'state-applied':
        this.appliedRevisions.push(event.revision)
        break
      case 'render-stats':
        this.renderStats.push({
          averageBlockMs: event.averageBlockMs,
          blockMs: event.blockMs,
          blocks: event.blocks,
          overruns: event.overruns,
        })
        break
      case 'error':
        this.errors.push({ phase: event.phase, message: event.message })
        break
    }
  }

  private requireAdapter(): VitalPresetAdapter {
    if (this.adapter === null) throw new Error('Vital development harness adapter is unavailable')
    return this.adapter
  }

  private requireHost(): VitalWorkletHost {
    if (this.host === null) throw new Error('Vital development harness is unavailable')
    return this.host
  }
}

export function installVitalDevHarness(): VitalDevHarness {
  if (window.__VITAL_HARNESS__ !== undefined) return window.__VITAL_HARNESS__

  const harness = new BrowserVitalDevHarness()
  window.__VITAL_HARNESS__ = harness
  window.addEventListener('pointerdown', () => harness.resumeFromGesture(), {
    capture: true,
    passive: true,
  })
  return harness
}
