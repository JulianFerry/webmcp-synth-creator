declare module 'virtual:vital-wasm-module' {
  import type { VitalWasmModuleFactory } from './VitalEngine'

  const createVitalModule: VitalWasmModuleFactory
  export default createVitalModule
}
