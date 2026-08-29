export interface VitalWasmModule {
  HEAPF32: Float32Array
  HEAPU8: Uint8Array
  _free(pointer: number): void
  _malloc(bytes: number): number
  _vital_all_notes_off(handle: number): void
  _vital_create(sampleRate: number): number
  _vital_destroy(handle: number): void
  _vital_load_state(handle: number, json: number, length: number): number
  _vital_note_off(handle: number, note: number): void
  _vital_note_on(handle: number, note: number, velocity: number): void
  _vital_process(handle: number, left: number, right: number, frames: number): void
  _vital_set_bpm(handle: number, bpm: number): void
}

export interface VitalWasmModuleOptions {
  locateFile?: (path: string, scriptDirectory: string) => string
}

export interface VitalEngineOptions extends VitalWasmModuleOptions {
  maxBlockFrames?: number
}

export type VitalWasmModuleFactory = (
  options?: VitalWasmModuleOptions,
) => Promise<VitalWasmModule>

export class VitalEngine {
  readonly maxBlockFrames: number
  readonly sampleRate: number

  private handle: number
  private leftPointer: number
  private rightPointer: number

  private constructor(
    private readonly module: VitalWasmModule,
    handle: number,
    sampleRate: number,
    maxBlockFrames: number,
    leftPointer: number,
    rightPointer: number,
  ) {
    this.handle = handle
    this.sampleRate = sampleRate
    this.maxBlockFrames = maxBlockFrames
    this.leftPointer = leftPointer
    this.rightPointer = rightPointer
  }

  static async create(
    factory: VitalWasmModuleFactory,
    sampleRate = 48_000,
    options?: VitalEngineOptions,
  ): Promise<VitalEngine> {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError('Vital sample rate must be a positive finite number')
    }

    const { maxBlockFrames = 128, ...moduleOptions } = options ?? {}
    if (!Number.isInteger(maxBlockFrames) || maxBlockFrames <= 0) {
      throw new RangeError('Vital maximum block size must be a positive integer')
    }

    const module = await factory(moduleOptions)
    const handle = module._vital_create(sampleRate)
    if (handle === 0) throw new Error('Vital engine construction failed')

    const bufferBytes = maxBlockFrames * Float32Array.BYTES_PER_ELEMENT
    const leftPointer = module._malloc(bufferBytes)
    const rightPointer = module._malloc(bufferBytes)
    if (leftPointer === 0 || rightPointer === 0) {
      if (leftPointer !== 0) module._free(leftPointer)
      if (rightPointer !== 0) module._free(rightPointer)
      module._vital_destroy(handle)
      throw new Error('Vital render buffer allocation failed')
    }

    return new VitalEngine(
      module,
      handle,
      sampleRate,
      maxBlockFrames,
      leftPointer,
      rightPointer,
    )
  }

  get isDisposed(): boolean {
    return this.handle === 0
  }

  loadState(json: string): boolean {
    this.assertActive()
    if (json.length === 0) throw new RangeError('Vital state JSON must not be empty')

    const bytes = new TextEncoder().encode(json)
    const pointer = this.module._malloc(bytes.byteLength)
    if (pointer === 0) throw new Error('Vital state buffer allocation failed')

    try {
      this.module.HEAPU8.set(bytes, pointer)
      return this.module._vital_load_state(this.handle, pointer, bytes.byteLength) !== 0
    } finally {
      this.module._free(pointer)
    }
  }

  setBpm(bpm: number): void {
    this.assertActive()
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new RangeError('Vital BPM must be a positive finite number')
    }
    this.module._vital_set_bpm(this.handle, bpm)
  }

  noteOn(note: number, velocity: number): void {
    this.assertMidiNote(note)
    if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1) {
      throw new RangeError('Vital note velocity must be between 0 and 1')
    }
    this.module._vital_note_on(this.handle, note, velocity)
  }

  noteOff(note: number): void {
    this.assertMidiNote(note)
    this.module._vital_note_off(this.handle, note)
  }

  allNotesOff(): void {
    this.assertActive()
    this.module._vital_all_notes_off(this.handle)
  }

  process(frames: number): void {
    this.assertActive()
    this.assertFrameCount(frames)
    this.module._vital_process(this.handle, this.leftPointer, this.rightPointer, frames)
  }

  copyStereoTo(left: Float32Array, right: Float32Array, frames: number): void {
    this.assertActive()
    this.assertFrameCount(frames)
    if (left.length < frames || right.length < frames) {
      throw new RangeError('Vital output arrays are smaller than the requested frame count')
    }

    const leftOffset = this.leftPointer / Float32Array.BYTES_PER_ELEMENT
    const rightOffset = this.rightPointer / Float32Array.BYTES_PER_ELEMENT
    left.set(this.module.HEAPF32.subarray(leftOffset, leftOffset + frames), 0)
    right.set(this.module.HEAPF32.subarray(rightOffset, rightOffset + frames), 0)
  }

  dispose(): void {
    if (this.handle === 0) return
    this.module._vital_destroy(this.handle)
    this.module._free(this.leftPointer)
    this.module._free(this.rightPointer)
    this.handle = 0
    this.leftPointer = 0
    this.rightPointer = 0
  }

  private assertActive(): void {
    if (this.handle === 0) throw new Error('Vital engine is disposed')
  }

  private assertFrameCount(frames: number): void {
    if (!Number.isInteger(frames) || frames <= 0 || frames > this.maxBlockFrames) {
      throw new RangeError(
        `Vital frame count must be an integer between 1 and ${this.maxBlockFrames}`,
      )
    }
  }

  private assertMidiNote(note: number): void {
    this.assertActive()
    if (!Number.isInteger(note) || note < 0 || note > 127) {
      throw new RangeError('Vital MIDI note must be an integer between 0 and 127')
    }
  }
}
