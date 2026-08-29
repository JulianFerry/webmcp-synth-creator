import { FILTER_CUTOFF_MAX_HZ, FILTER_CUTOFF_MIN_HZ } from '../patch/limits'
import type { FilterState } from '../patch/types'

export interface FilterNodeValues {
  type: BiquadFilterType
  frequencyHz: number
  q: number
}

export function resonanceToQ(
  resonance: number,
  type: BiquadFilterType = 'lowpass',
): number {
  const normalized = Math.max(0, Math.min(1, resonance))
  // Web Audio interprets Q as decibels for low/high-pass filters. A linear
  // control curve keeps low resonance settings audible; the old squared
  // curve reduced the calibration patch's 12% resonance to just 0.35 dB.
  if (type === 'lowpass' || type === 'highpass') return 0.0001 + normalized * 24
  return 0.0001 + normalized ** 2 * 24
}

export function getFilterNodeValues(
  filter: FilterState,
  sampleRate = 48_000,
): FilterNodeValues {
  const maximumFrequency = Math.min(FILTER_CUTOFF_MAX_HZ, sampleRate * 0.49)
  if (!filter.enabled) {
    return {
      type: 'lowpass',
      frequencyHz: maximumFrequency,
      q: 0.0001,
    }
  }

  return {
    type: filter.type,
    frequencyHz: Math.max(FILTER_CUTOFF_MIN_HZ, Math.min(maximumFrequency, filter.cutoffHz)),
    q: resonanceToQ(filter.resonance, filter.type),
  }
}

export function applyFilterState(
  node: BiquadFilterNode,
  filter: FilterState,
  time: number,
  smoothingSeconds = 0,
): FilterNodeValues {
  const values = getFilterNodeValues(filter, node.context.sampleRate)
  node.type = values.type
  setAudioParamValue(node.frequency, values.frequencyHz, time, smoothingSeconds)
  setAudioParamValue(node.Q, values.q, time, smoothingSeconds)
  return values
}

function setAudioParamValue(
  parameter: AudioParam,
  value: number,
  time: number,
  smoothingSeconds: number,
): void {
  if (smoothingSeconds <= 0) {
    parameter.cancelScheduledValues(time)
    parameter.setValueAtTime(value, time)
    return
  }

  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(time)
  } else {
    const heldValue = parameter.value
    parameter.cancelScheduledValues(time)
    parameter.setValueAtTime(heldValue, time)
  }
  parameter.linearRampToValueAtTime(value, time + smoothingSeconds)
}
