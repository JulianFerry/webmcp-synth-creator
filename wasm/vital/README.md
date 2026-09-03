# Vital WASM build

This target builds the headless Vital engine used by the application at the commit recorded in
`UPSTREAM.json`. The generated module is the only browser synthesis backend.

## Prerequisites

- emsdk `3.1.64`, activated in the current shell
- CMake `3.22` or newer
- Ninja
- Git and gzip

Install and activate the pinned SDK using the upstream emsdk checkout:

```sh
./emsdk install 3.1.64
./emsdk activate 3.1.64
source ./emsdk_env.sh
```

## Rebuild

For a fresh clone, install dependencies, fetch Vital, build the WASM artifacts,
and verify the production bundle with one command:

```sh
npm run setup:first-run
```

The script installs the pinned emsdk under the user cache by default. The
equivalent manual rebuild from the repository root is:

```sh
bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
```

The fetch script leaves the detached upstream checkout in `vendor/vital/`. Never edit that checkout by hand. Emscripten-specific upstream changes, if any become necessary, belong in `wasm/vital/patches/` and must be listed in `UPSTREAM.json`.

The build script performs a clean release build, emits `wasm/vital/build/vital.mjs` and
`wasm/vital/build/vital.wasm`, then prints raw and gzip-compressed sizes. Both the fetched source
and emitted artifacts are ignored by Git. `npm run build` requires both artifacts and copies them
to `dist/wasm/vital/build/` with the Init fixture plus the root `LICENSE` and `NOTICE`.

The repository is distributed under `GPL-3.0-or-later`. `NOTICE` records the pinned Vital source,
the incorporated source areas, and every local patch. A fresh clone reproduces the browser artifact
by running the fetch and build commands above; no generated binary or edited vendor checkout is
treated as source.

## Native fidelity reference

Phase 5 also builds a host executable from the same pinned checkout, applied patches, unity sources,
and `bridge.cpp` used by the WASM target:

```sh
bash wasm/vital/native/build.sh
```

The output is `wasm/vital/native/build/vital-native-render`. On Apple Silicon the build targets
`x86_64` because this Vital snapshot uses x86 SIMD; Rosetta 2 is therefore required. The renderer
accepts one adapter-generated Vital document and writes raw interleaved little-endian float32 stereo
for the fixed 48 kHz, MIDI 60, velocity `100 / 127`, 120 BPM, 2-second hold, and 3-second tail
schedule used by `tests/wasm/fidelity.test.ts`.
