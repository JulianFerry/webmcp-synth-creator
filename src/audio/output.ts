export const VOICE_BUS_HEADROOM_GAIN = 0.72
export const BROWSER_OUTPUT_GAIN = 2
export const BROWSER_OUTPUT_GAIN_DB = 20 * Math.log10(BROWSER_OUTPUT_GAIN)

export const OUTPUT_LIMITER_SETTINGS = {
  thresholdDb: -1,
  kneeDb: 0,
  ratio: 20,
  attackSeconds: 0.003,
  releaseSeconds: 0.08,
} as const

export function configureOutputLimiter(node: DynamicsCompressorNode, time: number): void {
  node.threshold.setValueAtTime(OUTPUT_LIMITER_SETTINGS.thresholdDb, time)
  node.knee.setValueAtTime(OUTPUT_LIMITER_SETTINGS.kneeDb, time)
  node.ratio.setValueAtTime(OUTPUT_LIMITER_SETTINGS.ratio, time)
  node.attack.setValueAtTime(OUTPUT_LIMITER_SETTINGS.attackSeconds, time)
  node.release.setValueAtTime(OUTPUT_LIMITER_SETTINGS.releaseSeconds, time)
}
