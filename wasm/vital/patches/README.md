# Upstream patches

This directory owns minimal Emscripten-only patches against the pinned Vital checkout. `0001-juce-emscripten-platform-guards.patch` omits Linux headers and floating-point control-register operations that do not exist in Emscripten while retaining JUCE's Linux/POSIX headless implementation. `0002-juce-disable-backtraces.patch` omits the unavailable native backtrace API. `0003-juce-wasm-linux-fallbacks.patch` disables native thread and file-limit setup and supplies a diagnostic locale fallback. `0004-vital-skip-installed-check.patch` prevents browser construction from probing a desktop data directory.

Do not edit `vendor/vital/` directly. If a patch becomes necessary, add it here, document the reason in `docs/vital-wasm-spike.md`, list it in `UPSTREAM.json`, and make `fetch-source.sh` apply it reproducibly.
