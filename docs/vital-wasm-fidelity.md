# Vital WASM fidelity and performance

Date: 2026-08-31

Phase 5 status: complete. Automated same-source fidelity, directional, and isolated Chromium
performance checks pass. Manual comparison confirmed the browser WASM exports sound the same in
desktop Vital 1.0.7, including the custom wavetable and rhythmic point-LFO stages, and scalar UI
and WebMCP edits remain immediate.

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

Phase 5 does not change the Phase 4 update policy:

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
| E - filter | `0.028255898 / 0.028255842` | `0.295134366 / 0.295134127` | `1420.880 / 1420.881 Hz` | `0.999999994964456` | `1.00e-4` |
| F - point LFO | `0.015990695 / 0.015990699` | `0.261353046 / 0.261352599` | `1047.340 / 1047.342 Hz` | `0.999999993388548` | `1.15e-4` |
| G - oscillator 2 | `0.050022116 / 0.050022123` | `0.366675824 / 0.366675645` | `815.749 / 815.747 Hz` | `0.999999999543505` | `3.02e-5` |
| H - delay and reverb | `0.052781289 / 0.052781319` | `0.332210213 / 0.332210034` | `627.229 / 627.228 Hz` | `0.999999999639281` | `2.69e-5` |

## Directional WASM checks

`tests/wasm/directional.test.ts` ports the legacy offline assertions to the actual Vital engine and
adds a progressive A-H diagnostic. Recorded directions include:

- B raises spectral centroid from 261 Hz to 2,566 Hz relative to the sine stage.
- C lowers first-50-ms RMS from `0.17425` to `0.01360` and retains a measurable release where B is silent.
- D raises stereo-difference RMS from zero to `0.01326`.
- E lowers centroid from 2,583 Hz to 1,421 Hz.
- F raises 10-ms block-RMS variation from `0.270` to `1.207`; adjacent 250-ms `1/8`
  cycles correlate at `0.9981` at 120 BPM.
- G raises RMS from `0.01599` to `0.05002` when oscillator 2 is enabled.
- H raises final-quarter tail RMS from numerical silence to `0.0002765`.
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

Passing isolated Chromium run on port 4181:

| Measurement | Result | Gate |
| --- | ---: | ---: |
| `vital.wasm` raw | `1,488,407 bytes` | `< 2,000,000` |
| `vital.wasm` Node gzip level 9 | `375,983 bytes` | `< 500,000` |
| Browser transfer / encoded / decoded | `1,488,707 / 1,488,407 / 1,488,407 bytes` | encoded and decoded equal artifact |
| Page navigation to processor ready | `3,043.2 ms` | `< 5,000 ms` |
| Host prepare to processor ready | `808.8 ms` | `< 2,000 ms` |
| One held voice | `0.160 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 1.333 ms` |
| Eight held voices | `0.473 ms average`, `1 ms max`, `0 / 256 overruns` | average `< 1.333 ms` |
| One-note, two-oscillator 8x-unison effects patch | `0.516 ms average`, `2 ms max`, `0 / 256 overruns` | average `< 1.333 ms` |
| Structural H load round trip / processor duration | `215.9 / 214 ms` | round trip `< 1,000 ms` |
| Scalar cutoff patch round trip / processor duration | `1.2 / 1 ms` | round trip `< 50 ms` |
| Audio quantum | `2.667 ms` | reference |
| Context base / reported output latency | `5.333 / 152 ms` | recorded, not loopback latency |

Chromium quantized `performance.now()` in the worklet to 1 ms. The gate therefore uses weighted
average block time, permits one 1-ms tick of uncertainty on interval maxima, and caps the measured
overrun rate at 2%. The passing run had zero measured overruns in all three steady scenarios.

### Checked-in command blocker

The exact command `npm run test:e2e -- vital-performance` did not execute this worktree's test. Port
4173 was already occupied by a Vite server from another worktree, and Playwright's checked-in
`reuseExistingServer` setting reused it. The run failed before telemetry with:

```text
TypeError: Failed to fetch dynamically imported module:
http://127.0.0.1:4173/src/audio/vital/VitalWorkletHost.ts
```

The same checked-in spec passed unchanged against this worktree on temporary port 4181. No port
override was kept in the repository. Because the literal validation command remains blocked, its
Phase 5 outline checkbox stays open.

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
| A | Sine oscillator, no filter/modulation/effects | Pass | Sounds the same in browser WASM and desktop Vital 1.0.7. |
| B | Custom Air Spectrum wavetable | Pass | Waveform character and fixed position match. |
| C | Attack, decay, sustain, and release | Pass | Envelope behavior matches. |
| D | Deterministic five-voice unison | Pass | Width and detune match. |
| E | 4.2 kHz resonant low-pass | Pass | Filter character matches. |
| F | Point LFO at `1/8`, 120 BPM | Pass | Shape, phase, depth, and shortened second pulse match. |
| G | Oscillator 2 one octave above | Pass | Oscillator contribution matches. |
| H | Synchronized delay and algorithmic reverb | Pass | Delay, reverb, and release tail match. |

Manual interaction checks completed:

1. Drag cutoff, level, wavetable position, detune, spread, and envelope controls with
   `?renderer=vital`; scalar previews must remain immediate and must not trigger structural loads.
2. Apply the same scalar edits through WebMCP while a note is held; confirm the audible change is
   immediate and no UI gesture is required after audio is running.
3. Confirm B and F match desktop Vital in custom-wavetable character and point-LFO shape, division,
   phase, shortened second pulse, and modulation depth.

## Gate decision

- Same-source A-H automation: pass.
- Ported WASM directional assertions: pass.
- Isolated Chromium artifact/init/block/state/scalar telemetry: pass.
- Checked-in Playwright spec: pass unchanged on isolated port 4181; the default port was occupied by
  another worktree during the recorded run.
- Desktop Vital 1.0.7 listening: pass.
- Human interaction-feel check: pass.

Phase 5 is accepted and Phase 6 may proceed.
