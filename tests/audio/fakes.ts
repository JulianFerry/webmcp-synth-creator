export interface AutomationCall {
  method:
    | 'cancelAndHold'
    | 'cancel'
    | 'set'
    | 'curve'
    | 'linearRamp'
    | 'exponentialRamp'
  value?: number
  time: number
  duration?: number
}

export class FakeAudioParam {
  value = 0
  readonly calls: AutomationCall[] = []

  cancelAndHoldAtTime(time: number): void {
    this.calls.push({ method: 'cancelAndHold', time })
  }

  cancelScheduledValues(time: number): void {
    this.calls.push({ method: 'cancel', time })
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push({ method: 'set', value, time })
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push({ method: 'linearRamp', value, time })
  }

  setValueCurveAtTime(values: Float32Array, time: number, duration: number): void {
    this.value = values.at(-1) ?? this.value
    this.calls.push({ method: 'curve', value: this.value, time, duration })
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push({ method: 'exponentialRamp', value, time })
  }
}

export class FakeAudioNode {
  readonly connections: unknown[] = []
  channelCount = 2
  channelCountMode: ChannelCountMode = 'max'
  channelInterpretation: ChannelInterpretation = 'speakers'

  constructor(readonly context: FakeAudioContext) {}

  connect<T>(destination: T): T {
    this.connections.push(destination)
    return destination
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam()
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass'
  readonly frequency = new FakeAudioParam()
  readonly Q = new FakeAudioParam()
  readonly gain = new FakeAudioParam()
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam()
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam()
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  normalize = true
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam()
  readonly knee = new FakeAudioParam()
  readonly ratio = new FakeAudioParam()
  readonly attack = new FakeAudioParam()
  readonly release = new FakeAudioParam()
  readonly reduction = 0
}

class FakeAudioBuffer {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly duration: number
  private readonly channels: Float32Array[]

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.duration = length / sampleRate
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]
  }
}

export class FakeOscillatorNode extends FakeAudioNode {
  readonly frequency = new FakeAudioParam()
  readonly detune = new FakeAudioParam()
  readonly waves: PeriodicWave[] = []
  readonly starts: number[] = []
  readonly stops: number[] = []

  setPeriodicWave(wave: PeriodicWave): void {
    this.waves.push(wave)
  }

  start(time = 0): void {
    this.starts.push(time)
  }

  stop(time = 0): void {
    this.stops.push(time)
  }
}

export class FakeAudioContext {
  currentTime = 0
  sampleRate = 48_000
  state: AudioContextState = 'suspended'
  readonly destination = new FakeAudioNode(this)
  readonly gains: FakeGainNode[] = []
  readonly filters: FakeBiquadFilterNode[] = []
  readonly oscillators: FakeOscillatorNode[] = []
  readonly panners: FakeStereoPannerNode[] = []
  readonly delays: FakeDelayNode[] = []
  readonly convolvers: FakeConvolverNode[] = []
  readonly compressors: FakeDynamicsCompressorNode[] = []
  private readonly stateListeners = new Set<() => void>()

  createGain(): GainNode {
    const node = new FakeGainNode(this)
    this.gains.push(node)
    return node as unknown as GainNode
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new FakeBiquadFilterNode(this)
    this.filters.push(node)
    return node as unknown as BiquadFilterNode
  }

  createOscillator(): OscillatorNode {
    const node = new FakeOscillatorNode(this)
    this.oscillators.push(node)
    return node as unknown as OscillatorNode
  }

  createStereoPanner(): StereoPannerNode {
    const node = new FakeStereoPannerNode(this)
    this.panners.push(node)
    return node as unknown as StereoPannerNode
  }

  createDelay(): DelayNode {
    const node = new FakeDelayNode(this)
    this.delays.push(node)
    return node as unknown as DelayNode
  }

  createConvolver(): ConvolverNode {
    const node = new FakeConvolverNode(this)
    this.convolvers.push(node)
    return node as unknown as ConvolverNode
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    const node = new FakeDynamicsCompressorNode(this)
    this.compressors.push(node)
    return node as unknown as DynamicsCompressorNode
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate) as unknown as AudioBuffer
  }

  createPeriodicWave(): PeriodicWave {
    return {} as PeriodicWave
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'statechange') return
    this.stateListeners.add(() => {
      if (typeof listener === 'function') listener(new Event('statechange'))
      else listener.handleEvent(new Event('statechange'))
    })
  }

  async resume(): Promise<void> {
    this.state = 'running'
    this.stateListeners.forEach((listener) => listener())
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext
  }
}
