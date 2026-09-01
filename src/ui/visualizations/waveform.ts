export interface WaveformBucket {
  minimum: number
  maximum: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function downsampleWaveform(
  samples: Float32Array,
  bucketCount: number,
): WaveformBucket[] {
  if (samples.length === 0 || bucketCount <= 0) return []
  const count = Math.min(samples.length, Math.floor(bucketCount))
  return Array.from({ length: count }, (_, bucketIndex) => {
    const start = Math.floor((bucketIndex * samples.length) / count)
    const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) * samples.length) / count))
    let minimum = 1
    let maximum = -1
    for (let index = start; index < end; index += 1) {
      const sample = clamp(samples[index], -1, 1)
      minimum = Math.min(minimum, sample)
      maximum = Math.max(maximum, sample)
    }
    return { minimum, maximum }
  })
}

export function buildMinMaxWaveformPath(
  samples: Float32Array,
  width = 100,
  height = 48,
  bucketCount = 160,
): string {
  const buckets = downsampleWaveform(samples, bucketCount)
  if (buckets.length === 0) return ''
  const center = height / 2
  const amplitude = height * 0.44
  const coordinate = (value: number) => (center - value * amplitude).toFixed(2)
  return buckets.map((bucket, index) => {
    const x = buckets.length === 1 ? width / 2 : (index / (buckets.length - 1)) * width
    return `M${x.toFixed(2)} ${coordinate(bucket.maximum)}L${x.toFixed(2)} ${coordinate(bucket.minimum)}`
  }).join('')
}
