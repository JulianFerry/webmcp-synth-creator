import type { EnvelopeState, PatchState } from '../../patch/types'

export const SPECTRAL_FINGERPRINT_FRAMES = 100
export const SPECTRAL_FINGERPRINT_BANDS = 88
export const SPECTRAL_FINGERPRINT_ROTATION_DEGREES = 34
export const SPECTRAL_FINGERPRINT_TILT_DEGREES = 30

const DURATION_SECONDS = 1.2
const FUNDAMENTAL_HZ = 130.81
const MIN_FREQUENCY_HZ = 70
const MAX_FREQUENCY_HZ = 12_000

export interface SpectralFingerprintSurface {
  bands: number
  frames: number
  magnitudes: Float32Array
}

interface ProjectedPoint {
  depth: number
  x: number
  y: number
}

interface Projection {
  centerX: number
  centerY: number
  rotation: number
  scale: number
  tilt: number
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function oscillatorHarmonics(patch: PatchState, oscillatorIndex: number): number[] {
  const oscillator = patch.oscillators[oscillatorIndex]
  const wavetable = patch.wavetableData[oscillator.wavetableId]
  if (!wavetable || wavetable.frames.length === 0) return [1]
  const framePosition = clamp(oscillator.wavetablePosition) * (wavetable.frames.length - 1)
  const lowerFrame = wavetable.frames[Math.floor(framePosition)]
  const upperFrame = wavetable.frames[Math.min(wavetable.frames.length - 1, Math.ceil(framePosition))]
  const mix = framePosition - Math.floor(framePosition)
  const harmonicCount = Math.max(lowerFrame?.harmonics.length ?? 0, upperFrame?.harmonics.length ?? 0)
  return Array.from({ length: harmonicCount }, (_, index) => {
    const lower = lowerFrame?.harmonics[index] ?? 0
    const upper = upperFrame?.harmonics[index] ?? 0
    return lower + (upper - lower) * mix
  })
}

function syncRateHz(division: string): number {
  const triplet = division.endsWith('T')
  const denominator = Number.parseInt(division.split('/')[1] ?? '4', 10)
  return Math.max(0.25, denominator / 2) * (triplet ? 1.5 : 1)
}

function lfoValue(patch: PatchState, time: number): number {
  if (!patch.lfo1.enabled || patch.lfo1.points.length === 0) return 1
  const rate = patch.lfo1.rate.mode === 'free' ? patch.lfo1.rate.hz : syncRateHz(patch.lfo1.rate.division)
  const phase = (time * rate + patch.lfo1.phase) % 1
  const points = [...patch.lfo1.points].sort((left, right) => left.x - right.x)
  const upperIndex = points.findIndex((point) => point.x >= phase)
  if (upperIndex <= 0) return points[Math.max(0, upperIndex)]?.y ?? 0
  const lower = points[upperIndex - 1]
  const upper = points[upperIndex]
  const span = Math.max(0.0001, upper.x - lower.x)
  let mix = (phase - lower.x) / span
  if (patch.lfo1.smooth) mix = mix * mix * (3 - 2 * mix)
  return lower.y + (upper.y - lower.y) * mix
}

function envelopeValue(envelope: EnvelopeState, time: number): number {
  const attackEnd = Math.max(0.001, envelope.attackSeconds)
  const holdEnd = attackEnd + envelope.holdSeconds
  const decayEnd = holdEnd + Math.max(0.001, envelope.decaySeconds)
  const releaseStart = DURATION_SECONDS * 0.78
  let heldValue: number
  if (time < attackEnd) heldValue = time / attackEnd
  else if (time < holdEnd) heldValue = 1
  else if (time < decayEnd) heldValue = 1 - (1 - envelope.sustainLevel) * ((time - holdEnd) / (decayEnd - holdEnd))
  else heldValue = envelope.sustainLevel
  if (time <= releaseStart) return heldValue
  const releaseProgress = (time - releaseStart) / Math.max(0.03, envelope.releaseSeconds)
  return heldValue * Math.exp(-4.6 * releaseProgress)
}

function filterGain(patch: PatchState, frequency: number, cutoff: number): number {
  if (!patch.filter.enabled) return 1
  const ratio = frequency / Math.max(20, cutoff)
  const resonance = clamp(patch.filter.resonance)
  const distance = Math.log2(Math.max(0.0001, ratio))
  const peak = resonance * 0.7 * Math.exp(-0.5 * (distance / 0.14) ** 2)
  switch (patch.filter.type) {
    case 'highpass':
      return 1 / Math.sqrt(1 + ratio ** -6) + peak
    case 'bandpass':
      return Math.exp(-0.5 * (distance / (0.42 - resonance * 0.2)) ** 2) + peak
    case 'notch':
      return 1 - 0.88 * Math.exp(-0.5 * (distance / (0.16 + (1 - resonance) * 0.12)) ** 2)
    default:
      return 1 / Math.sqrt(1 + ratio ** 6) + peak
  }
}

function delaySeconds(patch: PatchState): number {
  const delay = patch.effects.delay
  if (delay.mode === 'free') return delay.timeSeconds ?? 0.25
  return 1 / syncRateHz(delay.division ?? '1/8')
}

export function buildSpectralFingerprintSurface(patch: PatchState): SpectralFingerprintSurface {
  const oscillatorSpectra = patch.oscillators.map((oscillator, oscillatorIndex) => {
    const harmonics = oscillatorHarmonics(patch, oscillatorIndex)
    const fundamental = FUNDAMENTAL_HZ * 2 ** ((oscillator.transposeSemitones + oscillator.fineTuneCents / 100) / 12)
    const width = 0.045 + oscillator.unisonDetune * 0.035
    return Float32Array.from({ length: SPECTRAL_FINGERPRINT_BANDS }, (_, band) => {
      const frequency = MIN_FREQUENCY_HZ * (MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) ** (band / (SPECTRAL_FINGERPRINT_BANDS - 1))
      return harmonics.reduce((sum, amplitude, index) => {
        const harmonicFrequency = fundamental * (index + 1)
        if (harmonicFrequency > MAX_FREQUENCY_HZ * 1.2) return sum
        const distance = Math.log2(frequency / harmonicFrequency)
        return sum + amplitude * Math.exp(-0.5 * (distance / width) ** 2)
      }, 0)
    })
  })
  const magnitudes = new Float32Array(SPECTRAL_FINGERPRINT_FRAMES * SPECTRAL_FINGERPRINT_BANDS)
  const levelRoutes = patch.modulations.filter((route) => route.source === 'lfo1' && route.destination.endsWith('.level'))
  const cutoffRoute = patch.modulations.find((route) => route.source === 'lfo1' && route.destination === 'filter.cutoff')
  const delay = patch.effects.delay.enabled ? patch.effects.delay : null
  const reverb = patch.effects.reverb.enabled ? patch.effects.reverb : null
  let peak = 0

  for (let frame = 0; frame < SPECTRAL_FINGERPRINT_FRAMES; frame += 1) {
    const time = frame / (SPECTRAL_FINGERPRINT_FRAMES - 1) * DURATION_SECONDS
    const envelope = envelopeValue(patch.ampEnvelope, time)
    const lfo = lfoValue(patch, time)
    const delayedEnvelope = delay ? envelopeValue(patch.ampEnvelope, Math.max(0, time - delaySeconds(patch))) * delay.mix * (0.45 + delay.feedback * 0.45) : 0
    const reverbTail = reverb ? reverb.mix * (0.08 + 0.22 * (time / DURATION_SECONDS)) * Math.exp(-time / Math.max(0.2, reverb.decaySeconds)) : 0
    const filterCutoff = patch.filter.cutoffHz * 2 ** ((cutoffRoute?.amount ?? 0) * (lfo - 0.5) * 3)

    for (let band = 0; band < SPECTRAL_FINGERPRINT_BANDS; band += 1) {
      const frequency = MIN_FREQUENCY_HZ * (MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) ** (band / (SPECTRAL_FINGERPRINT_BANDS - 1))
      let source = 0
      patch.oscillators.forEach((oscillator, oscillatorIndex) => {
        if (!oscillator.enabled) return
        const route = levelRoutes.find(({ destination }) => destination === `oscillator${oscillatorIndex + 1}.level`)
        const modulation = route ? clamp(1 + route.amount * (lfo - (route.bipolar ? 0.5 : 1))) : 1
        source += oscillatorSpectra[oscillatorIndex][band] * oscillator.level * modulation
      })
      const shimmer = 0.94 + 0.06 * Math.sin(frame * 0.21 + band * 0.37)
      const value = Math.log1p(source * filterGain(patch, frequency, filterCutoff) * (envelope + delayedEnvelope + reverbTail) * shimmer * 7)
      magnitudes[frame * SPECTRAL_FINGERPRINT_BANDS + band] = value
      peak = Math.max(peak, value)
    }
  }
  if (peak > 0) for (let index = 0; index < magnitudes.length; index += 1) magnitudes[index] /= peak
  return { bands: SPECTRAL_FINGERPRINT_BANDS, frames: SPECTRAL_FINGERPRINT_FRAMES, magnitudes }
}

function project(x: number, y: number, z: number, projection: Projection): ProjectedPoint {
  const rotatedX = x * Math.cos(projection.rotation) + z * Math.sin(projection.rotation)
  const rotatedZ = -x * Math.sin(projection.rotation) + z * Math.cos(projection.rotation)
  const tiltedY = y * Math.cos(projection.tilt) - rotatedZ * Math.sin(projection.tilt)
  return {
    depth: y * Math.sin(projection.tilt) + rotatedZ * Math.cos(projection.tilt),
    x: projection.centerX + rotatedX * projection.scale,
    y: projection.centerY - tiltedY * projection.scale,
  }
}

function frequencyX(frequency: number): number {
  return Math.log(frequency / MIN_FREQUENCY_HZ) / Math.log(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) * 2 - 1
}

function timeZ(time: number): number {
  return time / DURATION_SECONDS * 2 - 1
}

function drawAxes(context: CanvasRenderingContext2D, projection: Projection, width: number): void {
  const timeEdge = project(0, 0, -1, projection).depth > project(0, 0, 1, projection).depth ? -1 : 1
  const frequencyEdge = project(-1, 0, 0, projection).depth > project(1, 0, 0, projection).depth ? -1 : 1
  context.lineWidth = 0.65
  context.strokeStyle = 'rgba(132, 149, 168, .28)'
  context.beginPath()
  ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, z], index) => {
    const point = project(x, 0, z, projection)
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  })
  context.closePath()
  context.stroke()

  context.font = '5.5px "JetBrains Mono", monospace'
  context.textAlign = 'center'
  context.textBaseline = 'top'
  const frequencyTicks = width < 200 ? [100, 1_000, 10_000] : [100, 500, 2_000, 10_000]
  frequencyTicks.forEach((frequency) => {
    const x = frequencyX(frequency)
    const start = project(x, 0, -1, projection)
    const end = project(x, 0, 1, projection)
    context.strokeStyle = 'rgba(132, 149, 168, .12)'
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
    const tick = project(x, 0, timeEdge * 1.06, projection)
    context.fillStyle = 'rgba(183, 196, 211, .72)'
    context.fillText(frequency >= 1_000 ? `${frequency / 1_000} kHz` : `${frequency} Hz`, tick.x, tick.y + 1)
  })

  context.textAlign = frequencyEdge < 0 ? 'right' : 'left'
  context.textBaseline = 'middle'
  ;[0, 0.6, 1.2].forEach((time) => {
    const z = timeZ(time)
    const start = project(-1, 0, z, projection)
    const end = project(1, 0, z, projection)
    context.strokeStyle = 'rgba(132, 149, 168, .12)'
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
    const tick = project(frequencyEdge * 1.05, 0, z, projection)
    context.fillStyle = 'rgba(183, 196, 211, .72)'
    context.fillText(`${time.toFixed(1)}s`, tick.x + (frequencyEdge < 0 ? -2 : 2), tick.y)
  })
}

export function drawSpectralFingerprint(
  context: CanvasRenderingContext2D,
  surface: SpectralFingerprintSurface | null,
  width: number,
  height: number,
  color: readonly [number, number, number],
  view = { rotation: SPECTRAL_FINGERPRINT_ROTATION_DEGREES, tilt: SPECTRAL_FINGERPRINT_TILT_DEGREES },
): void {
  const projection = {
    centerX: width * 0.54,
    centerY: height * 0.48,
    rotation: view.rotation * Math.PI / 180,
    scale: Math.min(width * 0.34, height * 0.58),
    tilt: view.tilt * Math.PI / 180,
  }
  drawAxes(context, projection, width)
  if (!surface) return
  const order = Array.from({ length: surface.frames }, (_, index) => index).sort((left, right) => {
    return project(0, 0, timeZ(left / (surface.frames - 1) * DURATION_SECONDS), projection).depth
      - project(0, 0, timeZ(right / (surface.frames - 1) * DURATION_SECONDS), projection).depth
  })

  order.forEach((frame) => {
    const z = timeZ(frame / (surface.frames - 1) * DURATION_SECONDS)
    const near = clamp((project(0, 0, z, projection).depth + 1) / 2)
    context.beginPath()
    const start = project(-1, 0, z, projection)
    context.moveTo(start.x, start.y)
    for (let band = 0; band < surface.bands; band += 1) {
      const magnitude = surface.magnitudes[frame * surface.bands + band] ?? 0
      const point = project(-1 + band / (surface.bands - 1) * 2, magnitude * 0.46, z, projection)
      context.lineTo(point.x, point.y)
    }
    const end = project(1, 0, z, projection)
    context.lineTo(end.x, end.y)
    context.closePath()
    context.fillStyle = `rgba(7, 10, 15, ${0.7 + near * 0.26})`
    context.fill()
    context.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.2 + near * 0.72})`
    context.lineWidth = 0.5 + near * 0.55
    context.stroke()
  })
}
