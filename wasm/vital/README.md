# Vital WASM build

This isolated target builds the headless Vital engine at the commit recorded in `UPSTREAM.json`. It does not feed the Vite application or replace `BrowserSynth`.

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

From the repository root:

```sh
bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
```

The fetch script leaves the detached upstream checkout in `vendor/vital/`. Never edit that checkout by hand. Emscripten-specific upstream changes, if any become necessary, belong in `wasm/vital/patches/` and must be listed in `UPSTREAM.json`.

The build script performs a clean release build, emits `wasm/vital/build/vital.mjs` and `wasm/vital/build/vital.wasm`, then prints raw and gzip-compressed sizes. Both the fetched source and emitted artifacts are ignored by Git. No derived Vital binary is copied into `dist/` in this phase.
