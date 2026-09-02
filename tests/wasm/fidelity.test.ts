import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { VitalEngine, type VitalWasmModuleFactory } from '../../src/audio/vital/VitalEngine'
import {
  measureVitalStereo,
  renderVitalOffline,
  type VitalOfflineRender,
} from '../../src/audio/vital/offlineRender'
import { vitalEnginePayload } from '../../src/audio/vital/state'
import { CALIBRATION_PRESET_ENTRIES } from '../../src/presets/patches/calibration'
import { VitalPresetAdapter } from '../../src/vital/VitalPresetAdapter'
import { findVitalArtifact, findVitalNativeRenderer } from './support/artifact'

const wasmArtifact = findVitalArtifact()
const nativeRenderer = findVitalNativeRenderer()
const sampleRate = 48_000
const outputDirectory = resolve(process.cwd(), 'test-results/vital-fidelity')
const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/vital/init.vital'), 'utf8'),
) as unknown
const adapter = new VitalPresetAdapter(fixture)

interface NativeReport {
  createMs: number
  nonFiniteSamples: number
  peak: number
  renderMs: number
  stateLoadMs: number
  totalFrames: number
}

interface FidelityTolerance {
  centroidRelative: number
  correlationMinimum: number
  normalizedError: number
  peakRelative: number
  rmsRelative: number
}

// Recorded on the pinned emsdk 3.1.64 / Apple clang 17 x86_64 reference. A-C stayed below
// 2.2e-7 normalized error; SIMD-heavy D-H stayed below 1.6e-4. The gates round those maxima up
// with margin instead of treating sample identity as a cross-compiler contract.
const tolerances: Record<string, FidelityTolerance> = {
  a: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.999999999,
    normalizedError: 0.0000025,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  b: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.999999999,
    normalizedError: 0.0000025,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  c: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.999999999,
    normalizedError: 0.0000025,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  d: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.99999995,
    normalizedError: 0.00035,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  e: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.99999995,
    normalizedError: 0.00035,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  f: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.99999995,
    normalizedError: 0.00035,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  g: {
    centroidRelative: 0.00001,
    correlationMinimum: 0.99999995,
    normalizedError: 0.00035,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
  h: {
    centroidRelative: 0.00005,
    correlationMinimum: 0.99999995,
    normalizedError: 0.00035,
    peakRelative: 0.00001,
    rmsRelative: 0.00001,
  },
}

const measurements: Array<Record<string, number | string>> = []
let factory: VitalWasmModuleFactory

describe.skipIf(wasmArtifact === null)('Vital WASM/native fidelity', () => {
  beforeAll(async () => {
    if (wasmArtifact === null) return
    const imported = (await import(pathToFileURL(wasmArtifact).href)) as {
      default: VitalWasmModuleFactory
    }
    factory = imported.default
    mkdirSync(outputDirectory, { recursive: true })
  })

  afterAll(() => {
    if (measurements.length === 0) return
    measurements.sort((left, right) => String(left.stage).localeCompare(String(right.stage)))
    writeFileSync(
      resolve(outputDirectory, 'measurements.json'),
      `${JSON.stringify(measurements, null, 2)}\n`,
    )
  })

  it('has a native reference whenever the WASM artifact is present', () => {
    expect(
      nativeRenderer,
      'Build the strict same-source reference with bash wasm/vital/native/build.sh',
    ).not.toBeNull()
  })

  it.each(CALIBRATION_PRESET_ENTRIES)(
    'keeps $id within its measured same-source tolerance',
    async ({ id, patch }) => {
      if (wasmArtifact === null || nativeRenderer === null) {
        throw new Error('Vital WASM/native fidelity artifacts disappeared during the test')
      }
      const stage = id.slice('calibration-'.length, 'calibration-x'.length)
      const tolerance = tolerances[stage]
      if (tolerance === undefined) throw new Error(`No fidelity tolerance recorded for ${id}`)

      const statePath = resolve(outputDirectory, `${id}.vital`)
      const nativeOutputPath = resolve(outputDirectory, `${id}-native.f32le`)
      const nativeReportPath = resolve(outputDirectory, `${id}-native.json`)
      writeFileSync(statePath, vitalEnginePayload(adapter, patch))
      const process = spawnSync(
        nativeRenderer,
        [
          '--state',
          statePath,
          '--output',
          nativeOutputPath,
          '--report',
          nativeReportPath,
          '--sample-rate',
          String(sampleRate),
          '--block-frames',
          '128',
          '--note',
          '60',
          '--velocity',
          String(100 / 127),
          '--bpm',
          '120',
          '--hold-seconds',
          '2',
          '--tail-seconds',
          '3',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      )
      expect(process.error, process.stderr).toBeUndefined()
      expect(process.status, process.stderr).toBe(0)

      const nativeReport = JSON.parse(readFileSync(nativeReportPath, 'utf8')) as NativeReport
      const native = readNativeStereo(nativeOutputPath, nativeReport.totalFrames)
      const engine = await VitalEngine.create(factory, sampleRate, {
        locateFile: (path) => resolve(dirname(wasmArtifact), path),
      })
      let wasm: VitalOfflineRender
      try {
        expect(engine.loadState(vitalEnginePayload(adapter, patch))).toBe(true)
        wasm = renderVitalOffline(engine)
      } finally {
        engine.dispose()
      }

      const nativeMetrics = measureVitalStereo(native.left, native.right, sampleRate)
      const alignment = compareAligned(wasm, native)
      const rmsRelative = relativeDifference(wasm.metrics.rms, nativeMetrics.rms)
      const peakRelative = relativeDifference(wasm.metrics.peak, nativeMetrics.peak)
      const centroidRelative = relativeDifference(
        wasm.metrics.spectralCentroidHz,
        nativeMetrics.spectralCentroidHz,
      )
      const measurement = {
        stage: stage.toUpperCase(),
        lagFrames: alignment.lagFrames,
        correlation: alignment.correlation,
        normalizedError: alignment.normalizedError,
        rmsRelative,
        peakRelative,
        centroidRelative,
        wasmRms: wasm.metrics.rms,
        nativeRms: nativeMetrics.rms,
        wasmPeak: wasm.metrics.peak,
        nativePeak: nativeMetrics.peak,
        wasmCentroidHz: wasm.metrics.spectralCentroidHz,
        nativeCentroidHz: nativeMetrics.spectralCentroidHz,
        wasmRenderMs: wasm.metrics.renderDurationMs,
        nativeRenderMs: nativeReport.renderMs,
        nativeCreateMs: nativeReport.createMs,
        nativeStateLoadMs: nativeReport.stateLoadMs,
      }
      measurements.push(measurement)
      console.info(`[vital-fidelity] ${JSON.stringify(measurement)}`)

      expect(nativeReport.nonFiniteSamples).toBe(0)
      expect(wasm.metrics.nonFiniteSamples).toBe(0)
      expect(Math.abs(alignment.lagFrames)).toBeLessThanOrEqual(128)
      expect(rmsRelative).toBeLessThanOrEqual(tolerance.rmsRelative)
      expect(peakRelative).toBeLessThanOrEqual(tolerance.peakRelative)
      expect(centroidRelative).toBeLessThanOrEqual(tolerance.centroidRelative)
      expect(alignment.correlation).toBeGreaterThanOrEqual(tolerance.correlationMinimum)
      expect(alignment.normalizedError).toBeLessThanOrEqual(tolerance.normalizedError)
    },
    120_000,
  )
})

function readNativeStereo(path: string, totalFrames: number): {
  left: Float32Array
  right: Float32Array
} {
  const bytes = readFileSync(path)
  expect(bytes.byteLength).toBe(totalFrames * 2 * Float32Array.BYTES_PER_ELEMENT)
  const left = new Float32Array(totalFrames)
  const right = new Float32Array(totalFrames)
  for (let frame = 0; frame < totalFrames; frame += 1) {
    left[frame] = bytes.readFloatLE(frame * 8)
    right[frame] = bytes.readFloatLE(frame * 8 + 4)
  }
  return { left, right }
}

function compareAligned(
  wasm: Pick<VitalOfflineRender, 'left' | 'right' | 'sampleRate'>,
  native: { left: Float32Array; right: Float32Array },
): { correlation: number; lagFrames: number; normalizedError: number } {
  const wasmMono = mono(wasm.left, wasm.right)
  const nativeMono = mono(native.left, native.right)
  const wasmOnset = findOnset(wasmMono)
  const nativeOnset = findOnset(nativeMono)
  const estimatedLag = nativeOnset - wasmOnset
  const comparisonStart = Math.max(wasmOnset, nativeOnset) + Math.round(wasm.sampleRate * 0.05)
  const comparisonFrames = Math.min(
    Math.round(wasm.sampleRate * 1.75),
    wasmMono.length - comparisonStart - 256,
    nativeMono.length - comparisonStart - 256,
  )

  let bestLag = estimatedLag
  let bestCorrelation = Number.NEGATIVE_INFINITY
  for (let lag = estimatedLag - 32; lag <= estimatedLag + 32; lag += 1) {
    const correlation = correlationAtLag(
      wasmMono,
      nativeMono,
      comparisonStart,
      comparisonFrames,
      lag,
      4,
    )
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }

  let differenceSquared = 0
  let referenceSquared = 0
  let dot = 0
  let candidateSquared = 0
  for (let offset = 0; offset < comparisonFrames; offset += 1) {
    const wasmSample = wasmMono[comparisonStart + offset]
    const nativeSample = nativeMono[comparisonStart + offset + bestLag]
    const difference = wasmSample - nativeSample
    differenceSquared += difference * difference
    referenceSquared += nativeSample * nativeSample
    candidateSquared += wasmSample * wasmSample
    dot += wasmSample * nativeSample
  }
  return {
    correlation: dot / Math.sqrt(referenceSquared * candidateSquared),
    lagFrames: bestLag,
    normalizedError: Math.sqrt(differenceSquared / referenceSquared),
  }
}

function mono(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(left.length)
  for (let frame = 0; frame < output.length; frame += 1) {
    output[frame] = (left[frame] + right[frame]) * 0.5
  }
  return output
}

function findOnset(samples: Float32Array): number {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  const threshold = peak * 1e-5
  for (let frame = 0; frame < samples.length; frame += 1) {
    if (Math.abs(samples[frame]) >= threshold) return frame
  }
  return 0
}

function correlationAtLag(
  candidate: Float32Array,
  reference: Float32Array,
  start: number,
  frames: number,
  lag: number,
  stride: number,
): number {
  let dot = 0
  let candidateSquared = 0
  let referenceSquared = 0
  for (let offset = 0; offset < frames; offset += stride) {
    const candidateSample = candidate[start + offset]
    const referenceSample = reference[start + offset + lag]
    dot += candidateSample * referenceSample
    candidateSquared += candidateSample * candidateSample
    referenceSquared += referenceSample * referenceSample
  }
  return dot / Math.sqrt(candidateSquared * referenceSquared)
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(right), 1e-12)
}
