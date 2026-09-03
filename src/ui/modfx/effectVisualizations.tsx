import type {
  CompressorState,
  DelayState,
  DistortionState,
  ReverbState,
} from '../../patch/types'

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function point(value: number): string {
  return value.toFixed(2)
}

function pointsPath(points: Array<{ x: number; y: number }>): string {
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${point(x)} ${point(y)}`).join(' ')
}

const SYNC_DIVISION_SECONDS: Record<NonNullable<DelayState['division']>, number> = {
  '1/1': 2,
  '1/2': 1,
  '1/4': .5,
  '1/8': .25,
  '1/8T': 1 / 6,
  '1/16': .125,
  '1/16T': 1 / 12,
  '1/32': .0625,
  '1/64': .03125,
}

export interface DelayPlot {
  label: string
  path: string
  taps: Array<{ level: number; x: number; y: number }>
}

export function createDelayPlot(delay: DelayState): DelayPlot {
  const seconds = delay.mode === 'sync'
    ? SYNC_DIVISION_SECONDS[delay.division ?? '1/8']
    : clamp(delay.timeSeconds ?? .25, .01, 2)
  const spacing = 8 + Math.sqrt(seconds / 2) * 11
  const mix = clamp(delay.mix)
  const feedback = clamp(delay.feedback)
  const taps = Array.from({ length: 9 }, (_, index) => {
    const level = mix * feedback ** index
    return {
      level,
      x: 7 + spacing * (index + 1),
      y: 39 - (4 + level * 27),
    }
  }).filter(({ x }) => x <= 97)

  return {
    label: delay.mode === 'sync'
      ? delay.division ?? '1/8'
      : `${Math.round(seconds * 1000)} ms`,
    path: taps.map(({ x, y }) => `M${point(x)} 39 L${point(x)} ${point(y)}`).join(' '),
    taps,
  }
}

export interface ReverbPlot {
  path: string
  roomInset: number
  startX: number
}

export function createReverbPlot(reverb: ReverbState): ReverbPlot {
  const mix = clamp(reverb.mix)
  const size = clamp(reverb.size)
  const decay = clamp(reverb.decaySeconds, .1, 20)
  const startX = 4 + clamp(reverb.predelay, 0, .3) / .3 * 17
  const falloff = 1.15 + (1 - Math.sqrt(decay / 20)) * 5.4
  const amplitude = (6 + size * 10) * (.3 + mix * .7)
  const density = 1.25 + size * 1.45
  const points = Array.from({ length: 49 }, (_, index) => {
    const progress = index / 48
    const x = startX + (97 - startX) * progress
    const envelope = Math.exp(-progress * falloff)
    const reflection = Math.sin(index * density) * .72 + Math.sin(index * density * 2.13) * .28
    const y = 23 - reflection * envelope * amplitude
    return { x, y }
  })

  return { path: pointsPath(points), roomInset: 3 + (1 - size) * 7, startX }
}

export interface CompressorPlot {
  attackWidth: number
  dryPath: string
  maxGainReductionDb: number
  path: string
  releaseWidth: number
  thresholdX: number
}

export function createCompressorPlot(compressor: CompressorState): CompressorPlot {
  const amount = clamp(compressor.amount)
  const mix = clamp(compressor.mix)
  const threshold = .56
  const ratio = 1 + amount * 11
  const compressedFullScale = threshold + (1 - threshold) / ratio
  const fullScaleOutput = 1 - mix + compressedFullScale * mix
  const coordinates = Array.from({ length: 41 }, (_, index) => {
    const input = index / 40
    const compressed = input <= threshold ? input : threshold + (input - threshold) / ratio
    const output = input * (1 - mix) + compressed * mix
    return { x: 4 + input * 92, y: 43 - output * 36 }
  })

  return {
    attackWidth: 7 + clamp(compressor.attack) * 29,
    dryPath: 'M4.00 43.00 L96.00 7.00',
    maxGainReductionDb: -20 * Math.log10(fullScaleOutput),
    path: pointsPath(coordinates),
    releaseWidth: 7 + clamp(compressor.release) * 29,
    thresholdX: 4 + threshold * 92,
  }
}

export interface DistortionPlot {
  path: string
}

export function createDistortionPlot(distortion: DistortionState): DistortionPlot {
  const drive = clamp(distortion.drive)
  const mix = clamp(distortion.mix)
  const gain = 1 + drive * 5
  const samples = Array.from({ length: 65 }, (_, index) => {
    const input = index / 32 - 1
    const driven = input * gain
    let shaped: number
    switch (distortion.type) {
      case 'hard_clip':
        shaped = clamp(driven, -1, 1)
        break
      case 'sine_fold':
        shaped = Math.sin(driven * Math.PI / 2)
        break
      case 'bit_crush': {
        const steps = Math.max(3, Math.round(24 - drive * 19))
        shaped = Math.round(clamp(driven, -1, 1) * steps) / steps
        break
      }
      default:
        shaped = Math.tanh(driven) / Math.tanh(gain)
    }
    const output = clamp(input * (1 - mix) + shaped * mix, -1, 1)
    return { x: 4 + index / 64 * 92, y: 23 - output * 17 }
  })

  return {
    path: pointsPath(samples),
  }
}

export function DelayVisual({ delay }: { delay: DelayState }) {
  const plot = createDelayPlot(delay)
  return <figure className="effect-value-visual delay-visual" data-testid="delay-visual">
    <svg aria-label={`${plot.label} delay with ${Math.round(delay.feedback * 100)} percent feedback and ${Math.round(delay.mix * 100)} percent mix`} preserveAspectRatio="none" role="img" viewBox="0 0 100 44">
      <path className="effect-visual-grid" d="M2 13H98M2 26H98M2 39H98" />
      <path className="delay-source-pulse" d={`M7 39V${point(35 - clamp(1 - delay.mix) * 24)}`} />
      <path className="delay-taps-path" d={plot.path} data-testid="delay-taps-path" />
      {plot.taps.map(({ level, x, y }, index) => <circle className="delay-tap" cx={x} cy={y} key={index} opacity={.28 + level * .72} r={1.2 + level * .8} />)}
    </svg>
    <figcaption><span>{delay.mode === 'sync' ? 'Tempo' : 'Free'}</span><strong>{plot.label}</strong><span>{Math.round(delay.feedback * 100)}% regen</span></figcaption>
  </figure>
}

export function ReverbVisual({ reverb }: { reverb: ReverbState }) {
  const plot = createReverbPlot(reverb)
  return <figure className="effect-value-visual reverb-visual" data-testid="reverb-visual">
    <svg aria-label={`${reverb.decaySeconds.toFixed(1)} second reverb tail at ${Math.round(reverb.size * 100)} percent room size and ${Math.round(reverb.mix * 100)} percent wet`} preserveAspectRatio="none" role="img" viewBox="0 0 100 44">
      <rect className="reverb-room" height={38 - plot.roomInset * 2} rx="3" width={94 - plot.roomInset * 2} x={3 + plot.roomInset} y={3 + plot.roomInset} />
      <line className="reverb-predelay" x1={plot.startX} x2={plot.startX} y1="5" y2="40" />
      <path className="reverb-tail-path" d={plot.path} data-testid="reverb-tail-path" />
    </svg>
    <figcaption><span>{Math.round(reverb.size * 100)}% room</span><strong>{reverb.decaySeconds.toFixed(1)} s tail</strong><span>{Math.round(reverb.mix * 100)}% wet</span></figcaption>
  </figure>
}

const COMPRESSOR_BANDS: Array<{ ariaLabel: string; label: string; value: CompressorState['bands'] }> = [
  { ariaLabel: 'Three-band compression', label: '3 band', value: 'multiband' },
  { ariaLabel: 'Low-band compression', label: 'Low', value: 'low' },
  { ariaLabel: 'High-band compression', label: 'High', value: 'high' },
]

export function CompressorVisual({ compressor, onBandChange }: { compressor: CompressorState; onBandChange: (bands: CompressorState['bands']) => void }) {
  const plot = createCompressorPlot(compressor)
  return <div className="effect-value-visual compressor-visual" data-testid="compressor-visual">
    <svg aria-label={`${plot.maxGainReductionDb.toFixed(1)} decibels maximum gain reduction at full-scale input, ${Math.round(compressor.amount * 100)} percent amount and ${Math.round(compressor.mix * 100)} percent mix`} preserveAspectRatio="none" role="img" viewBox="0 0 100 48">
      <path className="effect-visual-grid" d="M4 16H96M4 30H96M27 4V44M50 4V44M73 4V44" />
      <path className="compressor-dry-path" d={plot.dryPath} />
      <line className="compressor-threshold" x1={plot.thresholdX} x2={plot.thresholdX} y1="5" y2="43" />
      <path className="compressor-curve-path" d={plot.path} data-testid="compressor-curve-path" />
      <g className="compressor-ballistics">
        <line x1="7" x2={7 + plot.attackWidth} y1="8" y2="8" />
        <line x1="7" x2={7 + plot.releaseWidth} y1="13" y2="13" />
      </g>
    </svg>
    <div className="compressor-visual-footer">
      <span className="compressor-reduction"><small>Max GR</small><strong>-{plot.maxGainReductionDb.toFixed(1)} dB</strong></span>
      <div aria-label="Compression band" className="compressor-band-selector" role="group">
        {COMPRESSOR_BANDS.map(({ ariaLabel, label, value }) => <button aria-label={ariaLabel} aria-pressed={compressor.bands === value} key={value} onClick={() => onBandChange(value)} type="button"><i aria-hidden="true" /><span>{label}</span></button>)}
      </div>
    </div>
  </div>
}

export function DistortionVisual({ distortion }: { distortion: DistortionState }) {
  const plot = createDistortionPlot(distortion)
  const character = distortion.type.replace('_', ' ')
  return <figure className="effect-value-visual distortion-visual" data-testid="distortion-visual">
    <svg aria-label={`${character} transfer curve with ${Math.round(distortion.drive * 100)} percent drive and ${Math.round(distortion.mix * 100)} percent mix`} preserveAspectRatio="none" role="img" viewBox="0 0 100 44">
      <path className="effect-visual-grid" d="M4 23H96M50 4V42" />
      <path className="distortion-dry-path" d="M4 40 L96 6" />
      <path className="distortion-transfer-path" d={plot.path} data-testid="distortion-transfer-path" />
    </svg>
    <figcaption><span>{character}</span><strong>{Math.round(distortion.drive * 100)}% drive</strong><span>{Math.round(distortion.mix * 100)}% wet</span></figcaption>
  </figure>
}
