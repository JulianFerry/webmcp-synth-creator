# Vital WASM fidelity and performance

Date: 2026-09-01

Post-redesign integration status: the rebuilt WASM and native artifacts pass the automated
same-source fidelity, directional, three-oscillator/effect-model, and isolated Chromium performance
checks. A clean production preview also passes the gesture-gated playback, quick-preview, WebMCP,
import/export, effects, and responsive-layout matrix. A fresh desktop Vital 1.0.7 listening pass is
still required for the redesigned FX-filter, oscillator 3, and effect-order state; the pre-redesign
desktop result is historical evidence, not acceptance of the integrated state.

## Fixed baseline

- Vital source: `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836`.
- Preset boundary: the existing unmodified Vital 1.0.7 Init fixture.
- Render schedule: 48 kHz, 128-frame blocks, MIDI 60, velocity `100 / 127`, 120 BPM,
  2-second hold, and 3-second release/tail.
- Native reference: Apple clang 17, release `-O2 -ffast-math -msse2`, x86_64 under Rosetta 2.
- WASM reference: emsdk 3.1.64 release build with SIMD128.
- Calibration F is the structure-outline gate: synchronized `1/8` at 120 BPM.

The native target compiles the same `wasm/vital/bridge.cpp`, Vital unity sources, JUCE modules,
upstream checkout, and local patches as the WASM target. It changes the host compiler and output
format, not the state mapping or DSP host API.

```sh
source /tmp/wavetable-emsdk/emsdk_env.sh
export PATH="/tmp/vital-build-tools/bin:$PATH"
bash wasm/vital/build.sh
bash wasm/vital/native/build.sh
```

The native executable is `wasm/vital/native/build/vital-native-render`. It accepts one exact
adapter-generated Vital JSON document and emits interleaved little-endian float32 stereo plus a
JSON timing report. The binary measured 3,947,376 bytes on the reference machine; it is a local
test artifact and is ignored by Git.

## Runtime invariants retained

The redesign integration does not change the renderer update policy:

- Scalar edits and previews remain adapter-derived `vital_set_control` operations.
- Full state loads remain restricted to structural changes: filter topology, LFO points,
  oscillator wavetable identity, wavetable resources, and modulation topology.
- `VitalWorkletHost` still connects its node only after the processor reports `ready`.
- Structural loads still use `vital_begin_load_state`, bounded wavetable-frame steps, and
  `vital_finish_load_state`.
- No output mute, discarded begin block, note-on fade, or silent pre-ready warm render is present.
- The worklet still uses the observed output length, preallocated steady-state buffers, no fetch,
  and no logging in `process()`.

## Same-source fidelity gate

`tests/wasm/fidelity.test.ts` renders A-H through WASM and through the native executable, aligns
the waveforms, and compares RMS, peak, spectral centroid, correlation, and normalized waveform
error. Every observed alignment lag was zero frames.

The checked-in tolerances come from the measurements rather than from a perceptual guess:

| Stages | RMS / peak / centroid relative error | Minimum correlation | Maximum normalized waveform error | Measured worst normalized error |
| --- | ---: | ---: | ---: | ---: |
| A-C | `1e-5` | `0.999999999` | `2.5e-6` | `2.20e-7` |
| D-H | `1e-5` | `0.99999995` | `3.5e-4` | `1.59e-4` |

The wider D-H waveform envelope covers deterministic SIMD/compiler drift introduced by unison,
filtering, modulation, and effects. It remains far below a perceptual-similarity tolerance and is
not a replacement for desktop listening.

| Stage | WASM / native RMS | WASM / native peak | WASM / native centroid | Correlation | Normalized error |
| --- | ---: | ---: | ---: | ---: | ---: |
| A - sine | `0.158473121 / 0.158473132` | `0.354471803 / 0.354471803` | `261.464 / 261.465 Hz` | `0.999999999999954` | `1.48e-7` |
| B - custom wavetable | `0.112996627 / 0.112996621` | `0.421224535 / 0.421224475` | `2566.176 / 2566.176 Hz` | `0.999999999999935` | `2.14e-7` |
| C - envelope | `0.045012308 / 0.045012306` | `0.414479256 / 0.414479315` | `2567.552 / 2567.552 Hz` | `0.999999999999944` | `2.20e-7` |
| D - unison | `0.036851909 / 0.036851826` | `0.433421761 / 0.433421284` | `2582.979 / 2582.986 Hz` | `0.999999987325557` | `1.59e-4` |
| E - FX filter | `0.028861057 / 0.028860997` | `0.296064854 / 0.296064675` | `1421.940 / 1421.941 Hz` | `0.999999994786601` | `1.02e-4` |
| F - point LFO | `0.016478987 / 0.016478992` | `0.270872563 / 0.270872027` | `1055.038 / 1055.039 Hz` | `0.999999993064387` | `1.18e-4` |
| G - oscillator 2 | `0.053821798 / 0.053821813` | `0.397099972 / 0.397099853` | `808.249 / 808.247 Hz` | `0.999999999439216` | `3.35e-5` |
| H - delay and reverb | `0.056781835 / 0.056781877` | `0.362499833 / 0.362499684` | `622.701 / 622.701 Hz` | `0.999999999561003` | `2.96e-5` |

Stages E-H changed after the redesigned UI moved its logical filter from Vital Filter 1 into the
reorderable Vital FX chain and retained the six-stage UI effect order in `effect_chain_order`.
The measurements above are from the rebuilt post-redesign artifacts; A-D remain unchanged.

## Directional WASM checks

`tests/wasm/directional.test.ts` ports the legacy offline assertions to the actual Vital engine and
adds a progressive A-H diagnostic. Recorded directions include:

- B raises spectral centroid from 261 Hz to 2,566 Hz relative to the sine stage.
- C lowers first-50-ms RMS from `0.17425` to `0.01360` and retains a measurable release where B is silent.
- D raises stereo-difference RMS from zero to `0.01326`.
- E lowers centroid from 2,583 Hz to 1,421 Hz.
- F raises 10-ms block-RMS variation from `0.279` to `1.213`; adjacent 250-ms `1/8`
  cycles correlate at `0.9978` at 120 BPM.
- G raises RMS from `0.01648` to `0.05382` when oscillator 2 is enabled.
- H raises final-quarter tail RMS from numerical silence to `0.0003048`.
- The ported checks retain silence, level, octave, release, dark-filter, LFO, modulation-envelope,
  delay-tail, and reverb-tail directions against WASM output.

## State-load cost evidence

The Phase 3 cost attribution remains the source of truth for why scalar controls and incremental
structural loading are required:

| Operation | Controlled Node measurement |
| --- | ---: |
| Module init plus first / second `vital_create` | `103.7 / 70.1 ms` |
| Monolithic calibration A state | `9.1-10.4 ms` |
| Monolithic calibration D state | `60.6 ms` |
| Monolithic calibration H state | `57.6-63.5 ms` |
| Steady `process(128)` | approximately `0.012 ms` |

The dominant cost is rendering every wavetable frame through position 256. Incremental loading
reduced the measured Chromium state-switch callback from 80 ms to 14-16 ms, but the unsplittable
begin call still exceeds one 2.667 ms quantum. Phase 5 does not hide that call with a mute.

`tests/wasm/performance.test.ts` records Node wall-clock state and block costs. Absolute Node timing
is intentionally not the realtime oracle because Vitest runs files in parallel and can inflate a
single worker by more than an order of magnitude. The strict deadline check is the real Chromium
AudioWorklet test below; the Node test protects the scalar/full-load cost separation and scenario
ordering while retaining the raw measurements in `test-results/vital-performance/`.

## Browser performance gate

Passing isolated Chromium development-server run:

| Measurement | Result | Gate |
| --- | ---: | ---: |
| `vital.wasm` raw | `1,488,407 bytes` | `< 2,000,000` |
| `vital.wasm` Node gzip level 9 | `375,983 bytes` | `< 500,000` |
| Browser transfer / encoded / decoded | `1,488,707 / 1,488,407 / 1,488,407 bytes` | encoded and decoded equal artifact |
| Page navigation to processor ready | `1,131.2 ms` | `< 5,000 ms` |
| Host prepare to processor ready | `430.7 ms` | `< 2,000 ms` |
| One held voice | `0.180 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 2.000 ms` |
| Quick-preview three-note chord | `0.301 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 2.000 ms` |
| Eight held voices | `0.539 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 2.000 ms` |
| One-note, three-oscillator 8x-unison effects patch | `0.535 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 2.000 ms` |
| Three-wavetable structural state | `194,753 bytes` | records all three slots |
| Structural state round trip / processor duration | `221.1 / 216 ms` | round trip `< 1,000 ms` |
| Scalar cutoff round trip / processor duration | `2.5 / 1 ms` | round trip `< 50 ms` |
| Effect-order round trip / processor duration | `2.1 / 0 ms` | round trip `< 50 ms` |
| Audio quantum | `2.667 ms` | reference |
| Context base / reported output latency | `5.813 / 32 ms` | recorded, not loopback latency |

Chromium quantized `performance.now()` in the worklet to 1 ms. The gate therefore requires 25%
average deadline headroom and permits one 1-ms tick of uncertainty on interval maxima. Raw overrun
counts remain recorded diagnostics rather than a hard gate: a reported 3 ms block cannot be
classified reliably against a 2.667 ms quantum with a 1 ms clock. The recorded reference run had
zero measured overruns in all four steady scenarios.

### Checked-in command

Playwright derives an isolated default port from the workspace path and accepts `PLAYWRIGHT_PORT`
when an explicit port is needed. The performance spec runs in its own project before the remaining
Chromium suite and uses a blank same-origin harness instead of starting the application's default
renderer beside the measured host. This avoids reuse of a Vite server from another worktree,
parallel browser-test contention, and a second Vital engine competing with the measurement. The
exact command `npm run test:e2e -- vital-performance` exercises this worktree and passes.

`npm run test:e2e:preview` performs a clean production build and then runs 21 production-server
checks covering first-gesture startup and release, quick previews, WebMCP state edits, Vital
import/export, effect ordering, tabs, and desktop/tablet/mobile layouts. The built distribution
contains `vital.mjs`, `vital.wasm`, `fixtures/vital/init.vital`, `LICENSE`, and `NOTICE`.

## Desktop Vital 1.0.7 manual matrix

Use matched monitoring level and, where the host permits it, 48 kHz. Set host tempo to 120 BPM.
For every stage use MIDI 60 at velocity `100 / 127`, hold for 2 seconds, release, and listen through
3 seconds of tail. In the browser dev console, the isolated same-state path is:

```js
const h = window.__VITAL_HARNESS__
await h.prepare()
await h.loadCalibration('a')
await h.play(60, 100 / 127)
// hold for two seconds
await h.stop(60)
```

Export the same stage and load it into desktop Vital 1.0.7. Retrigger both renderers before each
comparison. Metrics support the comparison; they do not replace listening.

| Stage | Manual target | Browser WASM vs desktop Vital 1.0.7 | Notes |
| --- | --- | --- | --- |
| A | Sine oscillator, no filter/modulation/effects | Pending rerun | Passed before the redesign integration; rerun with the rebuilt export. |
| B | Custom Air Spectrum wavetable | Pending rerun | Passed before the redesign integration; rerun with the rebuilt export. |
| C | Attack, decay, sustain, and release | Pending rerun | Passed before the redesign integration; rerun with the rebuilt export. |
| D | Deterministic five-voice unison | Pending rerun | Passed before the redesign integration; rerun with the rebuilt export. |
| E | Reorderable 4.2 kHz resonant FX low-pass | Pending | The pre-redesign pass used Filter 1 and does not cover the integrated mapping. |
| F | Point LFO at `1/8`, 120 BPM through the FX filter | Pending | Confirm shape, phase, depth, and shortened second pulse. |
| G | Oscillator 2 one octave above through the FX chain | Pending | Confirm oscillator contribution and chain routing. |
| H | Reordered FX filter, synchronized delay, and reverb | Pending | Confirm processor placement and release tail. |

The fresh pass must also cover an oscillator-3-only patch, oscillator 3 modulation, lowpass,
highpass, bandpass, and notch FX-filter types, and at least two filter/delay/reverb orders. Those
cases pass adapter, import/export, WASM render, and browser automation, but same-source automation
cannot verify the desktop Vital application boundary.

Manual interaction checks to repeat with the post-redesign build:

1. Drag cutoff, level, wavetable position, detune, spread, and envelope controls with the default
   renderer; scalar previews must remain immediate and must not trigger structural loads.
2. Apply the same scalar edits through WebMCP while a note is held; confirm the audible change is
   immediate and no UI gesture is required after audio is running.
3. Confirm B and F match desktop Vital in custom-wavetable character and point-LFO shape, division,
   phase, shortened second pulse, and modulation depth.

## Gate decision

- Rebuilt same-source A-H automation: pass.
- Oscillator 3, FX-filter type, modulation, and reordered-effects WASM automation: pass.
- Ported WASM directional assertions: pass.
- Isolated Chromium artifact/init/block/state/scalar/order telemetry: pass.
- Development-server browser suite: 52 passed; one compact-layout assertion failed once and passed
  immediately on focused rerun.
- Clean production-preview matrix: 21 passed.
- Distribution assets and corresponding-source metadata: pass.
- Fresh desktop Vital 1.0.7 listening: pending external manual gate.
- Post-redesign human interaction-feel check: pending with the desktop comparison.

The automated and distributable integration is accepted. Final interoperability sign-off remains
blocked only on the fresh external desktop Vital 1.0.7 listening matrix above.
