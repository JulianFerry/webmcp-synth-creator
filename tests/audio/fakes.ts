export interface AutomationCall {
  method: 'cancelAndHold' | 'cancel' | 'set' | 'linearRamp' | 'exponentialRamp'
  value?: number
  time: number
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

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value
    this.calls.push({ method: 'exponentialRamp', value, time })
  }
}

class FakeAudioNode {
  constructor(readonly context: FakeAudioContext) {}

  connect<T>(destination: T): T {
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
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam()
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
