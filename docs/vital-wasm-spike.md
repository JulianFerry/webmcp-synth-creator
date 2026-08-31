# Vital WASM feasibility spike

## Scope and source

Phases 1 and 2 are an isolated build and offline-render gate. They use `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836` under GPL-3.0-or-later and do not change application audio behavior or put a derived binary in `dist/`.

## Entry classes

- `SynthBase` owns `vital::SoundEngine`, control state, preset loading, wavetables, LFO generators, MIDI state, and output reflection.
- `HeadlessSynth` supplies the non-GUI lock and pause hooks required by `SynthBase`.
- `vital::SoundEngine` owns note events, tempo, sample rate, block processing, voices, effects, and the stereo output buffer.
- `LoadSave::jsonToState` is reached through a small `HeadlessSynth` subclass that exposes the protected in-memory `loadFromJson` path without browser file I/O.

## Required source

- `src/unity_build/synthesis.cpp` and all headers under `src/synthesis/`
- `src/unity_build/common.cpp`, `src/common/`, and `src/common/wavetable/`
- `third_party/json`, `third_party/concurrentqueue`, and the pinned JUCE modules
- JUCE `audio_basics`, `audio_formats`, `core`, `data_structures`, `dsp`, and `events` module translation units from the upstream headless target

The target excludes Vital's GUI, OpenGL interface, plugin, editor, standalone shell, authentication, and desktop audio-device host.

## JUCE and platform dependencies

- Upstream `SynthBase` still uses JUCE strings, JSON-adjacent buffers, MIDI types, callbacks, locks, file abstractions, and audio-format symbols even in the headless build.
- The upstream headless target normally defines Linux, `HEADLESS`, and `NO_AUTH`, and links curl, pthread, `dl`, and `rt`. This target disables curl/authentication and uses Emscripten's single-thread runtime; it does not enable pthreads or shared memory.
- Vital requires four-lane SIMD. The WASM build enables Emscripten SIMD128 and the source's SSE2 compatibility path.
- No runtime network access, packaged resources, or browser filesystem contract is exposed by the bridge.

## Expected Emscripten blockers

- JUCE 6.0.5 has no explicit Emscripten platform target, so the spike initially compiles its headless POSIX/Linux path and records every incompatibility found.
- JUCE core pulls Linux-only `sys/prctl.h` and `sys/ptrace.h` into module translation units; the local patch omits those unused includes for Emscripten and disables native thread naming and process file-limit setup.
- JUCE's SSE path reads and writes the native floating-point status register. Emscripten exposes the SIMD intrinsics Vital needs but not `_mm_setcsr`, so the local patch leaves JUCE's status-register hooks as no-ops on WASM.
- JUCE's Linux backtrace path requires `execinfo.h`, which Emscripten does not provide; the local patch returns an empty diagnostic backtrace on WASM.
- GNU locale identification constants are unavailable, so the patched diagnostic locale defaults to `en-US` on WASM.
- Vital initializes its default sample from a 44,100-float stack buffer, so the link reserves a 5 MiB WASM stack rather than Emscripten's 64 KiB default.
- Vital's startup check probes for an installed desktop data directory. The WASM patch reports that desktop install as absent, avoiding filesystem syscalls while preserving the no-filesystem module contract.
- JUCE audio formats defaults to compiling bundled FLAC code with native CPU assembly. FLAC and Ogg codecs are disabled because the in-memory Vital state path does not use them.
- Vital's source assumes SSE2 or NEON intrinsics; Emscripten's SSE-to-SIMD128 compatibility must compile the full DSP unity build.
- `SynthBase` construction initializes wavetable creators, MIDI helpers, callbacks, and startup checks, so construction is a stronger dependency test than allocating `SoundEngine` alone.
- The public source identifies version 1.0.6 while the Workbench fixture identifies 1.0.7. Preset compatibility is intentionally deferred to Phase 2.

## Minimal bridge

`wasm/vital/bridge.cpp` is the only JavaScript-facing C surface:

```cpp
VitalSynth* vital_create(float sample_rate);
void vital_destroy(VitalSynth* synth);
bool vital_load_state(VitalSynth* synth, const char* json, int length);
bool vital_begin_load_state(VitalSynth* synth, const char* json, int length);
int vital_step_load_state(VitalSynth* synth, int max_frames);
bool vital_finish_load_state(VitalSynth* synth);
void vital_set_bpm(VitalSynth* synth, float bpm);
void vital_note_on(VitalSynth* synth, int note, float velocity);
void vital_note_off(VitalSynth* synth, int note);
void vital_all_notes_off(VitalSynth* synth);
void vital_process(VitalSynth* synth, float* left, float* right, int frames);
```

Phase 1 exercises create/destroy. Phase 2 exercises the monolithic state and render calls. Phase 3 exercises `vital_all_notes_off` and the incremental state-loading calls in the real-time harness.

## Build result

The clean release build succeeds with emsdk 3.1.64. After exporting allocator access for pinned render/state buffers, the generated artifacts are:

- `vital.mjs`: 47,739 bytes raw; 13,299 bytes gzip
- `vital.wasm`: 1,483,938 bytes raw; 374,399 bytes gzip

The conditional Vitest smoke test imports the generated ES module, constructs the engine at 48 kHz, destroys it, and passes. The build still emits upstream numerical-conversion and fast-math warnings; no warning blocks linking or construction.

## Phase 2 offline state and render result

`VitalEngine` allocates fixed left/right buffers when the engine is created, copies state JSON through a temporary WASM allocation outside the render loop, and processes observed block lengths into those pinned buffers. The bridge advances Vital's host time before each DSP block, including when one JavaScript request is split at Vital's maximum internal block size.

The offline harness uses 48 kHz, 120 BPM, MIDI note 60, velocity `100 / 127`, a two-second hold, and a three-second release/effect tail. It writes stereo PCM16 files under `test-results/vital-wasm/` and rejects non-finite output, silence, peaks above 1.0, or a full silent block after a held note becomes audible.

The public source with 1.0.6 metadata successfully loads the existing unmodified 1.0.7 Init fixture. It also loads the exact `VitalPresetAdapter.exportPatch(patch).json` payload for the default patch and calibration stages A-H. No source-version fallback, fixture retargeting, or second PatchState mapper was required.

| State | RMS | Peak | Five-second render |
|---|---:|---:|---:|
| Init fixture | 0.09131 | 0.35880 | 185.7 ms |
| Default patch | 0.04162 | 0.29042 | 369.7 ms |
| Calibration A | 0.15847 | 0.35447 | 89.7 ms |
| Calibration B | 0.11300 | 0.42122 | 90.6 ms |
| Calibration C | 0.04501 | 0.41448 | 111.5 ms |
| Calibration D | 0.03685 | 0.43342 | 118.4 ms |
| Calibration E | 0.02826 | 0.29513 | 158.1 ms |
| Calibration F | 0.02351 | 0.29513 | 156.2 ms |
| Calibration G | 0.05283 | 0.41903 | 209.0 ms |
| Calibration H | 0.05549 | 0.38241 | 332.3 ms |

These local Node/Vitest measurements render five seconds of audio in 1.8%-7.4% of real time for the calibration ladder. They are a rough feasibility signal, not an AudioWorklet deadline measurement; real-time block cost, initialization, state-load time, and polyphony remain later gates.

## Go/no-go

**Phase 2 gate: GO.** Vital constructs, renders a hard-coded C4, accepts the pinned 1.0.7 fixture and every Workbench calibration export, produces finite non-silent bounded output, and has plausible offline cost. No new JUCE/platform blocker appeared in Phase 2, and the source-version compatibility risk did not materialize.

Manual listening confirmed calibration A, D, F, and H are recognizable synth tones without audible corruption. Playing the same exported states at C4 in desktop Vital 1.0.7 confirmed the same family of sound. This clears the offline-render gate for the real-time AudioWorklet harness; detailed fidelity remains a Phase 5 acceptance gate.

## Phase 3 AudioWorklet result

The real-time harness compiles the WASM module on the main thread, passes the compiled module into a conventional `AudioWorkletProcessor`, and constructs two isolated engines in the render scope. The host does not connect the node to the destination until the processor reports `ready`, keeping WASM construction and initial state loading out of the live graph. The development harness also resumes its `AudioContext` before host preparation so device startup does not coincide with the first note.

State-load measurements showed that Vital renders every wavetable frame position through the final keyframe. Calibration H therefore renders 257 FFT-domain frames and takes about 58 ms in Node or 80 ms in a Chromium callback as a monolithic load. Patch `0005-vital-optional-wavetable-render.patch` adds an optional render argument to `WavetableCreator::jsonToState` while preserving the original one-argument behavior. The bridge uses that seam to apply non-wavetable state in `vital_begin_load_state`, render bounded frame batches through `vital_step_load_state`, and finish post-processing in `vital_finish_load_state`.

The incremental path is sample-for-sample identical to monolithic loading across repeated A, B, D, F, and H transitions. In Chromium it reduces the worst state-switch callback from about 80 ms to 14-16 ms; the remaining unsplittable `begin` work is JSON parsing, controls, sample decoding, and LFO setup. The worklet deliberately does not mute around that callback, and it does not perform a silent warm render before readiness. Those artifact-hiding experiments were removed; connect-after-ready and bounded incremental loading are the retained fixes.

After adding the incremental bridge exports, a clean emsdk 3.1.64 release build emits:

- `vital.mjs`: 48,147 bytes raw; 13,365 bytes gzip
- `vital.wasm`: 1,487,915 bytes raw; 375,802 bytes gzip

Automated worklet, equivalence, unit, type, lint, and production-build checks pass. Phase 3 remains at manual verification: a listener must confirm the combined first-use note onset, the held A-to-H transition, and a log-free render-thread profile before the phase is marked complete.
