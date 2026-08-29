export interface VitalWasmModule {
  _vital_create(sampleRate: number): number
  _vital_destroy(handle: number): void
}

export interface VitalWasmModuleOptions {
  locateFile?: (path: string, scriptDirectory: string) => string
}

export type VitalWasmModuleFactory = (
  options?: VitalWasmModuleOptions,
) => Promise<VitalWasmModule>

export class VitalEngine {
  private handle: number

  private constructor(
    private readonly module: VitalWasmModule,
    handle: number,
  ) {
    this.handle = handle
  }

  static async create(
    factory: VitalWasmModuleFactory,
    sampleRate = 48_000,
    options?: VitalWasmModuleOptions,
  ): Promise<VitalEngine> {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError('Vital sample rate must be a positive finite number')
    }

    const module = await factory(options)
    const handle = module._vital_create(sampleRate)
    if (handle === 0) throw new Error('Vital engine construction failed')
    return new VitalEngine(module, handle)
  }

  get isDisposed(): boolean {
    return this.handle === 0
  }

  dispose(): void {
    if (this.handle === 0) return
    this.module._vital_destroy(this.handle)
    this.handle = 0
  }
}
