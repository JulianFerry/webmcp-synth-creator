# Vital WASM feasibility spike

## Scope and source

Phase 1 is an isolated build/instantiate gate. It uses `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836` under GPL-3.0-or-later and does not change application audio behavior or put a derived binary in `dist/`.

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
void vital_set_bpm(VitalSynth* synth, float bpm);
void vital_note_on(VitalSynth* synth, int note, float velocity);
void vital_note_off(VitalSynth* synth, int note);
void vital_all_notes_off(VitalSynth* synth);
void vital_process(VitalSynth* synth, float* left, float* right, int frames);
```

Only create/destroy is exercised in Phase 1. Preset loading and rendering are Phase 2 gates.

## Build result

The clean release build succeeds with emsdk 3.1.64. The generated artifacts are:

- `vital.mjs`: 47,687 bytes raw; 13,278 bytes gzip
- `vital.wasm`: 1,483,823 bytes raw; 374,344 bytes gzip

The conditional Vitest smoke test imports the generated ES module, constructs the engine at 48 kHz, destroys it, and passes. The build still emits upstream numerical-conversion and fast-math warnings; no warning blocks linking or construction.
