import { describe, expect, it } from 'vitest'

import type { SynthPreviewRender } from '../../src/audio/previewRender'
import { previewPlayheadPosition } from '../../src/ui/analysis/playhead'

const render: SynthPreviewRender = {
  samples: new Float32Array(),
  sampleRate: 24_000,
  attackHoldEndSeconds: 0.5,
  sustainStartSeconds: 0.5,
  sustainEndSeconds: 1,
  releaseStartSeconds: 1,
  durationSeconds: 2.5,
}

describe('preview playhead', () => {
  it('maps attack time directly into the render timeline', () => {
    expect(previewPlayheadPosition(render, { noteOnSeconds: 10, noteOffSeconds: null }, 10.25)).toBeCloseTo(0.1)
  })

  it('loops through the sustain window while held', () => {
    const timing = { noteOnSeconds: 10, noteOffSeconds: null }
    expect(previewPlayheadPosition(render, timing, 10.75)).toBeCloseTo(0.3)
    expect(previewPlayheadPosition(render, timing, 11.25)).toBeCloseTo(0.3)
  })

  it('runs from release through the effects tail and then hides', () => {
    const timing = { noteOnSeconds: 10, noteOffSeconds: 11 }
    expect(previewPlayheadPosition(render, timing, 11.5)).toBeCloseTo(0.6)
    expect(previewPlayheadPosition(render, timing, 13)).toBeNull()
    expect(previewPlayheadPosition(render, null, 13)).toBeNull()
  })
})
