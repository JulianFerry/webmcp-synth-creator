import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../patch/limits'
import type { ModulationDestination, PatchState } from '../patch/types'
import { encodeVitalOscillatorLevel } from '../vital/units'
import { transposeFrequency } from './units'
import {
  DEFAULT_TEMPO_BPM,
  evaluateEnvelope,
  evaluateLfo,
  type EnvelopeReleaseState,
} from './lfo'

export interface ModulationFrame {
  oscillatorLevels: [number, number]
  wavetablePositions: [number, number]
  oscillatorFrequencies: [number, number]
  filterCutoffHz: number
  lfoValue: number
  modEnvelopeValue: number
}

export interface ModulationTarget {
  applyModulationFrame(frame: ModulationFrame, time: number): void
  resetModulation(patch: PatchState, time: number): void
}

interface DestinationAmounts {
  'oscillator1.level': number
  'oscillator1.wavetablePosition': number
  'oscillator1.pitch': number
  'oscillator2.level': number
  'oscillator2.wavetablePosition': number
  'oscillator2.pitch': number
  'filter.cutoff': number
}

const VITAL_TUNE_RANGE_SEMITONES = 2
const VITAL_FILTER_CUTOFF_RANGE_SEMITONES = 128

const EMPTY_AMOUNTS: DestinationAmounts = {
  'oscillator1.level': 0,
  'oscillator1.wavetablePosition': 0,
  'oscillator1.pitch': 0,
  'oscillator2.level': 0,
  'oscillator2.wavetablePosition': 0,
  'oscillator2.pitch': 0,
  'filter.cutoff': 0,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function modulationSignal(value: number, bipolar: boolean): number {
  // Vital's modulation processor uses 0..1 for unipolar routes. Bipolar mode
  // shifts that to -0.5..0.5 so the serialized amount retains the same total
  // travel around the base value.
  return bipolar ? value - 0.5 : value
}

function destinationAmounts(
  patch: PatchState,
  lfoValue: number,
  modEnvelopeValue: number,
): DestinationAmounts {
  const amounts = { ...EMPTY_AMOUNTS }
  for (const route of patch.modulations) {
    if (route.source === 'lfo1' && !patch.lfo1.enabled) continue
    const sourceValue = route.source === 'lfo1' ? lfoValue : modEnvelopeValue
    amounts[route.destination] += route.amount * modulationSignal(sourceValue, route.bipolar)
  }
  return amounts
}

export function evaluateModulationFrame(
  patch: PatchState,
  midi: number,
  elapsedSeconds: number,
  bpm = DEFAULT_TEMPO_BPM,
  release?: EnvelopeReleaseState,
): ModulationFrame {
  const lfoValue = evaluateLfo(patch.lfo1, elapsedSeconds, bpm)
  const modEnvelopeValue = evaluateEnvelope(patch.modEnvelope, elapsedSeconds, release)
  const amounts = destinationAmounts(patch, lfoValue, modEnvelopeValue)
  const oscillatorFrequencies = patch.oscillators.map((oscillator, index) => {
    const destination = `oscillator${index + 1}.pitch` as ModulationDestination
    return transposeFrequency(
      midi,
      oscillator.transposeSemitones + amounts[destination] * VITAL_TUNE_RANGE_SEMITONES,
      oscillator.fineTuneCents,
    )
  }) as [number, number]

  return {
    oscillatorLevels: patch.oscillators.map((oscillator, index) => {
      const destination = `oscillator${index + 1}.level` as ModulationDestination
      // Convert to Vital's raw domain for modulation, then scale its effective
      // 0..0.5 nominal range back to the browser's unchanged 0..1 range.
      return (
        clamp(encodeVitalOscillatorLevel(oscillator.level) + amounts[destination], 0, 1) ** 2 * 2
      )
    }) as [number, number],
    wavetablePositions: patch.oscillators.map((oscillator, index) => {
      const destination = `oscillator${index + 1}.wavetablePosition` as ModulationDestination
      return clamp(oscillator.wavetablePosition + amounts[destination], 0, 1)
    }) as [number, number],
    oscillatorFrequencies,
    filterCutoffHz: clamp(
      patch.filter.cutoffHz *
        2 ** ((amounts['filter.cutoff'] * VITAL_FILTER_CUTOFF_RANGE_SEMITONES) / 12),
      FILTER_CUTOFF_MIN_HZ,
      FILTER_CUTOFF_MAX_HZ,
    ),
    lfoValue,
    modEnvelopeValue,
  }
}

export function scheduleModulationRange(
  patch: PatchState,
  midi: number,
  voiceStartTime: number,
  startTime: number,
  endTime: number,
  target: ModulationTarget,
  options: {
    bpm?: number
    intervalSeconds?: number
    release?: EnvelopeReleaseState
  } = {},
): number {
  const interval = options.intervalSeconds ?? 0.02
  let scheduled = 0
  for (let time = startTime; time <= endTime + interval * 0.25; time += interval) {
    target.applyModulationFrame(
      evaluateModulationFrame(
        patch,
        midi,
        Math.max(0, time - voiceStartTime),
        options.bpm,
        options.release,
      ),
      time,
    )
    scheduled += 1
  }
  return scheduled
}

export class ModulationScheduler {
  private patch: PatchState
  private nextScheduleTime: number
  private releaseState: EnvelopeReleaseState | undefined
  private timer: number | null = null
  private disposed = false
  private revision = 0

  constructor(
    private readonly context: BaseAudioContext,
    patch: PatchState,
    private readonly midi: number,
    private readonly voiceStartTime: number,
    private readonly target: ModulationTarget,
    private readonly bpm = DEFAULT_TEMPO_BPM,
  ) {
    this.patch = structuredClone(patch)
    this.nextScheduleTime = voiceStartTime
    this.scheduleLookAhead()
    if (typeof window !== 'undefined') {
      this.timer = window.setInterval(() => this.scheduleLookAhead(), 50)
    }
  }

  get scheduleRevision(): number {
    return this.revision
  }

  updatePatch(patch: PatchState, time = this.context.currentTime): void {
    if (this.disposed) return
    this.patch = structuredClone(patch)
    this.nextScheduleTime = time
    this.target.resetModulation(this.patch, time)
    this.scheduleLookAhead()
  }

  release(time = this.context.currentTime): void {
    if (this.disposed || this.releaseState) return
    const elapsedSeconds = Math.max(0, time - this.voiceStartTime)
    this.releaseState = {
      elapsedSeconds,
      startValue: evaluateEnvelope(this.patch.modEnvelope, elapsedSeconds),
    }
    this.nextScheduleTime = time
    this.scheduleLookAhead()
  }

  scheduleLookAhead(horizonSeconds = 0.15): number {
    if (this.disposed) return 0
    const now = this.context.currentTime
    const start = Math.max(now, this.nextScheduleTime)
    const end = now + horizonSeconds
    if (start > end) return 0
    const count = scheduleModulationRange(
      this.patch,
      this.midi,
      this.voiceStartTime,
      start,
      end,
      this.target,
      { bpm: this.bpm, release: this.releaseState },
    )
    this.nextScheduleTime = end + 0.02
    this.revision += 1
    return count
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
