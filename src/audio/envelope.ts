import type { EnvelopeState } from '../patch/types'
import { vitalPowerScale } from './units'

const VITAL_DECAY_POWER = -2
const VITAL_RELEASE_POWER = -2
const VITAL_ATTACK_POWER = 0

export interface EnvelopeSchedule {
  attackEnd: number
  holdEnd: number
  decayEnd: number
  sustainGain: number
}

export function createVitalEnvelopeCurve(
  start: number,
  end: number,
  power: number,
  pointCount = 64,
): Float32Array {
  const count = Math.max(2, Math.floor(pointCount))
  return Float32Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1)
    return start + (end - start) * vitalPowerScale(progress, power)
  })
}

/**
 * Vital squares envelope 1 before applying it to the complete voice output.
 * This is separate from the oscillator-level quadratic parameter mapping.
 */
export function createVitalAmplitudeCurve(
  startEnvelopeValue: number,
  endEnvelopeValue: number,
  power: number,
  pointCount = 64,
  peakGain = 1,
): Float32Array {
  const envelope = createVitalEnvelopeCurve(
    startEnvelopeValue,
    endEnvelopeValue,
    power,
    pointCount,
  )
  return Float32Array.from(envelope, (value) => peakGain * value * value)
}

function scheduleAmplitudeCurve(
  parameter: AudioParam,
  startEnvelopeValue: number,
  endEnvelopeValue: number,
  startTime: number,
  duration: number,
  power: number,
  peakGain = 1,
): void {
  if (duration <= 0) {
    parameter.setValueAtTime(peakGain * endEnvelopeValue ** 2, startTime)
    return
  }

  const points = Math.max(32, Math.min(256, Math.ceil(duration * 120)))
  const curve = createVitalAmplitudeCurve(
    startEnvelopeValue,
    endEnvelopeValue,
    power,
    points,
    peakGain,
  )
  // Consecutive setValueCurveAtTime events are unsafe in Chromium: the curve
  // start is render-quantum aligned internally, which can make an event at the
  // mathematical end time overlap the curve and throw. Piecewise ramps retain
  // the same shape without that overlap restriction.
  parameter.setValueAtTime(curve[0], startTime)
  for (let index = 1; index < curve.length; index += 1) {
    parameter.linearRampToValueAtTime(
      curve[index],
      startTime + duration * (index / (curve.length - 1)),
    )
  }
}

export function getEnvelopeSchedule(
  envelope: EnvelopeState,
  startTime: number,
  peakGain = 1,
): EnvelopeSchedule {
  const attackEnd = startTime + envelope.attackSeconds
  const holdEnd = attackEnd + envelope.holdSeconds
  return {
    attackEnd,
    holdEnd,
    decayEnd: holdEnd + envelope.decaySeconds,
    sustainGain: peakGain * envelope.sustainLevel ** 2,
  }
}

export function cancelAndHoldAudioParam(parameter: AudioParam, time: number): void {
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(time)
    return
  }

  const heldValue = parameter.value
  parameter.cancelScheduledValues(time)
  parameter.setValueAtTime(heldValue, time)
}

export function scheduleEnvelopeAttack(
  parameter: AudioParam,
  envelope: EnvelopeState,
  startTime: number,
  peakGain = 1,
): EnvelopeSchedule {
  const schedule = getEnvelopeSchedule(envelope, startTime, peakGain)
  cancelAndHoldAudioParam(parameter, startTime)
  parameter.setValueAtTime(0, startTime)

  if (envelope.attackSeconds === 0) parameter.setValueAtTime(peakGain, startTime)
  else {
    scheduleAmplitudeCurve(
      parameter,
      0,
      1,
      startTime,
      envelope.attackSeconds,
      VITAL_ATTACK_POWER,
      peakGain,
    )
  }

  if (envelope.decaySeconds === 0) {
    parameter.setValueAtTime(schedule.sustainGain, schedule.holdEnd)
  } else {
    scheduleAmplitudeCurve(
      parameter,
      1,
      envelope.sustainLevel,
      schedule.holdEnd,
      envelope.decaySeconds,
      VITAL_DECAY_POWER,
      peakGain,
    )
  }
  return schedule
}

export function scheduleEnvelopeRelease(
  parameter: AudioParam,
  releaseSeconds: number,
  releaseTime: number,
): number {
  const releaseEnd = releaseTime + Math.max(0.005, releaseSeconds)
  cancelAndHoldAudioParam(parameter, releaseTime)
  scheduleAmplitudeCurve(
    parameter,
    Math.sqrt(Math.max(0, parameter.value)),
    0,
    releaseTime,
    releaseEnd - releaseTime,
    VITAL_RELEASE_POWER,
  )
  return releaseEnd
}

export function updateEnvelopeSustain(
  parameter: AudioParam,
  sustainLevel: number,
  time: number,
): void {
  cancelAndHoldAudioParam(parameter, time)
  const clampedSustain = Math.max(0, Math.min(1, sustainLevel))
  parameter.linearRampToValueAtTime(clampedSustain ** 2, time + 0.02)
}

export function updateEnvelopeAttack(
  parameter: AudioParam,
  envelope: EnvelopeState,
  time: number,
  peakGain = 1,
): EnvelopeSchedule {
  const schedule = getEnvelopeSchedule(envelope, time, peakGain)
  cancelAndHoldAudioParam(parameter, time)
  if (envelope.attackSeconds === 0) parameter.setValueAtTime(peakGain, time)
  else {
    const heldEnvelopeValue = Math.sqrt(Math.max(0, parameter.value) / peakGain)
    scheduleAmplitudeCurve(
      parameter,
      heldEnvelopeValue,
      1,
      time,
      envelope.attackSeconds,
      VITAL_ATTACK_POWER,
      peakGain,
    )
  }
  if (envelope.decaySeconds === 0) {
    parameter.setValueAtTime(schedule.sustainGain, schedule.holdEnd)
  } else {
    scheduleAmplitudeCurve(
      parameter,
      1,
      envelope.sustainLevel,
      schedule.holdEnd,
      envelope.decaySeconds,
      VITAL_DECAY_POWER,
      peakGain,
    )
  }
  return schedule
}

export function updateEnvelopeDecay(
  parameter: AudioParam,
  envelope: EnvelopeState,
  time: number,
): void {
  cancelAndHoldAudioParam(parameter, time)
  scheduleAmplitudeCurve(
    parameter,
    Math.sqrt(Math.max(0, parameter.value)),
    Math.max(0, Math.min(1, envelope.sustainLevel)),
    time,
    Math.max(0.02, envelope.decaySeconds),
    VITAL_DECAY_POWER,
  )
}
