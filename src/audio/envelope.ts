import type { EnvelopeState } from '../patch/types'

export interface EnvelopeSchedule {
  attackEnd: number
  holdEnd: number
  decayEnd: number
  sustainGain: number
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
    sustainGain: peakGain * envelope.sustainLevel,
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
  else parameter.linearRampToValueAtTime(peakGain, schedule.attackEnd)

  parameter.setValueAtTime(peakGain, schedule.holdEnd)
  if (envelope.decaySeconds === 0) {
    parameter.setValueAtTime(schedule.sustainGain, schedule.holdEnd)
  } else {
    parameter.linearRampToValueAtTime(schedule.sustainGain, schedule.decayEnd)
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
  parameter.linearRampToValueAtTime(0, releaseEnd)
  return releaseEnd
}

export function updateEnvelopeSustain(
  parameter: AudioParam,
  sustainLevel: number,
  time: number,
): void {
  cancelAndHoldAudioParam(parameter, time)
  parameter.linearRampToValueAtTime(Math.max(0, Math.min(1, sustainLevel)), time + 0.02)
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
  else parameter.linearRampToValueAtTime(peakGain, schedule.attackEnd)
  parameter.setValueAtTime(peakGain, schedule.holdEnd)
  if (envelope.decaySeconds === 0) {
    parameter.setValueAtTime(schedule.sustainGain, schedule.holdEnd)
  } else {
    parameter.linearRampToValueAtTime(schedule.sustainGain, schedule.decayEnd)
  }
  return schedule
}

export function updateEnvelopeDecay(
  parameter: AudioParam,
  envelope: EnvelopeState,
  time: number,
): void {
  cancelAndHoldAudioParam(parameter, time)
  parameter.linearRampToValueAtTime(
    Math.max(0, Math.min(1, envelope.sustainLevel)),
    time + Math.max(0.02, envelope.decaySeconds),
  )
}
