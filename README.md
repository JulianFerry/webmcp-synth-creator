# Wavetable Workbench

Wavetable Workbench is a React/Vite application for editing one synth patch from
the UI or Chrome WebMCP, auditioning it through Vital's DSP in a browser
`AudioWorklet`, and exporting a `.vital` preset. Browser playback and export
consume the same adapter-generated Vital document.

## Prerequisites

Required before running the setup script:

- macOS or Linux with Bash
- Node.js `^20.19.0` or `>=22.12.0`, with npm
- Git and gzip
- Internet access to clone emsdk and the pinned Vital source
- On macOS, the Xcode Command Line Tools (`xcode-select --install`)
- On macOS, [Homebrew](https://brew.sh/) if CMake, Ninja, or Python 3 is not already installed

The setup script installs and activates emsdk `3.1.64`. It also installs missing
CMake, Ninja, and Python 3 packages through Homebrew on macOS. On Linux, install
CMake `3.22` or newer, Ninja, and Python 3 with the system package manager before
running setup.

Chrome and desktop Vital are not required to compile the project. They are used
for these optional workflows:

- Chrome with WebMCP testing enabled and the [Model Context Tool Inspector][inspector] for WebMCP
- Desktop Vital 1.0.7 for manual export, listening, and fidelity checks

## First-time setup

Clone the repository, enter it, and run the automated setup from the repository
root:

```bash
git clone https://github.com/JulianFerry/wavetable-workbench.git
cd wavetable-workbench
npm run setup:first-run
```

`setup:first-run` performs the complete reproducible build bootstrap:

1. Verifies the supported Node.js version and required host tools.
2. Installs missing CMake, Ninja, and Python 3 packages with Homebrew on macOS.
3. Clones emsdk into the user cache, then installs and activates emsdk `3.1.64`.
4. Runs `npm ci` from `package-lock.json`.
5. Fetches `mtytel/vital` at commit `636ca0ef517a4db087a6a08a6a8a5e704e21f836`.
6. Applies the checked-in patches from `wasm/vital/patches/`.
7. Builds `wasm/vital/build/vital.mjs` and `wasm/vital/build/vital.wasm`.
8. Runs `npm run build` to verify and create the production distribution.

The emsdk checkout defaults to:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/wavetable-workbench/emsdk
```

Use another location by setting `EMSDK_DIR`:

```bash
EMSDK_DIR="$HOME/tools/emsdk" npm run setup:first-run
```

The SDK version can be overridden for toolchain investigation, but normal builds
should use the pinned default:

```bash
EMSDK_VERSION=3.1.64 npm run setup:first-run
```

Preview every command without downloading, installing, or building anything:

```bash
npm run setup:first-run -- --dry-run
```

The Vital checkout and generated build artifacts are deliberately ignored by
Git. Every fresh clone must run first-time setup or the equivalent manual steps.
Rerunning the script is safe: emsdk and the Vital checkout are reused, while npm
dependencies and the Vital WASM build are recreated deterministically.

### Manual setup

Use these steps instead of `setup:first-run` when managing emsdk yourself:

```bash
npm ci

git clone https://github.com/emscripten-core/emsdk.git "$HOME/tools/emsdk"
"$HOME/tools/emsdk/emsdk" install 3.1.64
"$HOME/tools/emsdk/emsdk" activate 3.1.64
source "$HOME/tools/emsdk/emsdk_env.sh"

bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
npm run build
```

If an emsdk checkout already exists, omit the clone command and use its path for
the install, activate, and `source` commands. More Vital-specific and native
reference details are in [`wasm/vital/README.md`](wasm/vital/README.md).

## Development

After first-time setup, start Vite from the repository root:

```bash
npm run dev -- --strictPort
```

Open the URL printed by Vite. The checked-in development configuration uses
`http://127.0.0.1:4173`. `--strictPort` makes startup fail instead of silently
selecting another port when `4173` is occupied.

The generated WASM artifacts must remain under `wasm/vital/build/` for browser
audio. Vite development can start without them, but Vital playback is unavailable
and the console reports that the module is missing.

Set a safe output level, then click **Hold C2** (MIDI note 48) to start audio. Browser autoplay
rules require this direct user gesture; a WebMCP tool call cannot start audio.
The app preloads the module after first render, but it does not connect the
`AudioWorkletNode` until the processor reports ready and does not resume the
`AudioContext` without a gesture. Scalar edits use adapter-derived incremental
control operations; structural resource edits use the incremental full-state
loader. Neither path inserts an output mute.
Use **Make darker** or WebMCP while the note is held, **Undo transaction** to
revert the latest edit, and **Release C2** when finished.

## Use Chrome WebMCP

1. Enable **WebMCP for testing** at `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.
2. Install and enable the [Model Context Tool Inspector][inspector].
3. Open the Vite URL in a top-level Chrome tab and wait for the app's WebMCP status to read `available`.
4. Open the Inspector side panel with the workbench tab active. It should discover `get_patch` and `apply_patch`.
5. Run `get_patch` with `{}`.
6. Click **Hold C2**, then run `apply_patch` with this complete input object:

```json
{
  "reason": "Make the held patch darker",
  "changes": [
    {
      "path": "filter.cutoffHz",
      "value": 3200
    }
  ]
}
```

Do not wrap the input in an `input` or `arguments` property. A successful call
changes the visible cutoff, latest diff, and held browser preview. Undo or reload
before repeating the same value because no-op edits are rejected.

For a quick discovery check in the workbench tab's DevTools Console:

```js
(await document.modelContext.getTools()).map(({ name }) => name)
```

## Export to Vital

Wait for **Vital fixture ready**, make the desired edits, and click **Export
.vital**. Load the downloaded file in your local Vital installation. On the
browser, the default renderer runs the pinned Vital DSP through WebAssembly.
The renderer payload and downloaded preset body are the same serialized Vital
document; only the download filename is export-specific.

Use the header's starting-patch dropdown for a starting point. **Import Vital** retains
the complete source document, loads it unchanged into Vital WASM, and derives a
best-effort PatchState projection for the controls the Workbench can edit. A compact notice at
the top names active effects outside those controls and visible controls affected by hidden native
modulation such as macros.
Supported edits are overlaid without removing samples, extra modulators, macros,
effects, filter models, or routing, and an untouched import exports byte-for-byte
unchanged. A successful import replaces only the selected A/B variant as one undoable
transaction. Malformed files leave the patch and history unchanged.

### Browser/Vital calibration ladder

The **Calibration ladder** group in the starting-patch menu contains eight cumulative
test patches. A is one retriggered sine oscillator with a neutral gate envelope; B adds
the custom Air Spectrum wavetable; C adds ADSR; D adds deterministic unison; E enables
the reorderable Vital FX filter; F enables the global eighth-note LFO gate; G enables OSC2; and H
enables delay and reverb. Parameters for later stages are already configured while
bypassed, so each step activates only the subsystem named in its title. Enabled
calibration oscillators use the workbench's `100%` reference level.

For each letter, press A or hold C2 (MIDI note 48) in the browser, listen, export the
preset, then press A at the same keyboard-octave setting in Vital at a matched output
level. Release and retrigger the note after changing stages.
After each note-on, the audition panel reports input-to-renderer time, note dispatch
time, browser latency properties, the render quantum, and estimated first-sample and
envelope threshold times. Start audio before comparing notes so the one-time context
startup cost is not mixed into the steady-state result. The same structured sample is
available in DevTools as `window.__WAVETABLE_WORKBENCH_NOTE_TIMING__`. The output and
envelope figures are clock-based estimates, not an acoustic loopback measurement.
Oscillator level uses the workbench's `0–100%` logical range. At the Vital boundary,
`100%` maps to Vital's effective level `0.5`; the shared adapter writes
`sqrt(workbenchLevel × 0.5)` to Vital's quadratic raw parameter and import reverses it.
Thus `71%` exports as an effective Vital level of approximately `0.355`.
Unison detune is also quadratic in Vital: the workbench's `0–100%` span is
`0–24` cents and maps to Vital's displayed/effective `0–12%` span. Calibration
D's `25%` therefore loads as `3%` in Vital, with the same approximately six-cent
outer-voice detune as the browser.
The first strongly different browser/desktop pair is the useful result: A/B points at
state or wavetable compatibility, C at envelopes, D at unison, E at the FX filter, F at
LFO mapping/timing, G at oscillator summing, and H at the effects chain. D deliberately
keeps random phase at zero, and every stage ignores note velocity, so repeated trials
are stable. LFO 1 always gates the combined level of every enabled Workbench oscillator;
its destination and depth are fixed rather than preset-specific. After A-H, separately verify an OSC3-only patch, all four
FX-filter types, and at least two filter/delay/reverb orders; those redesigned-state
cases are automated against WASM but still require a fresh desktop Vital listening pass.

The automated fidelity reference uses MIDI 60, velocity `100 / 127`, 120 BPM, a
2-second hold, and a 3-second release/tail at 48 kHz for both WASM and the native
same-source renderer. See [`docs/vital-wasm-fidelity.md`](docs/vital-wasm-fidelity.md)
for the post-redesign measurements, browser costs, native build instructions, and the
exact status of the external desktop Vital 1.0.7 listening gate.

The exporter clones `fixtures/vital/init.vital`; dependency installation does
not create or replace it. See [`fixtures/vital/README.md`](fixtures/vital/README.md)
for fixture evidence, provenance limitations, and compatibility records.

## Build

After first-time setup, create a production distribution with:

```bash
npm run build
```

The build first runs TypeScript with `--noEmit`, then creates the optimized Vite
bundle in `dist/`. It intentionally fails when either generated Vital artifact is
missing. A successful distribution contains:

- The application HTML, JavaScript, CSS, and AudioWorklet assets
- `dist/wasm/vital/build/vital.mjs`
- `dist/wasm/vital/build/vital.wasm`
- `dist/fixtures/vital/init.vital`
- `dist/LICENSE` and `dist/NOTICE`

Run the production output locally with:

```bash
npm run preview
```

The preview server uses `http://127.0.0.1:4173` by default. Build output under
`dist/` is generated and ignored by Git.

### Rebuild Vital WASM

Rebuild the engine after changing `wasm/vital/bridge.cpp`, CMake configuration,
or a patch under `wasm/vital/patches/`. Activate the emsdk environment in the
current shell first:

```bash
source "${XDG_CACHE_HOME:-$HOME/.cache}/wavetable-workbench/emsdk/emsdk_env.sh"
bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
npm run build
```

`fetch-source.sh` verifies the exact pinned commit and applies each checked-in
patch idempotently. `build.sh` performs a clean release build and reports raw and
gzip-compressed artifact sizes.

### Build the native fidelity reference

The native renderer is required only for the same-source WASM fidelity suite:

```bash
source "${XDG_CACHE_HOME:-$HOME/.cache}/wavetable-workbench/emsdk/emsdk_env.sh"
bash wasm/vital/fetch-source.sh
bash wasm/vital/native/build.sh
```

On Apple Silicon this native target builds for `x86_64`, so Rosetta 2 is required.
The output is `wasm/vital/native/build/vital-native-render` and is ignored by Git.

## Checks

First-time setup already runs type checking and the production build. To run the
complete local verification matrix, install Playwright's Chromium binary once and
then execute:

```bash
npx playwright install chromium
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run test:e2e:preview
```

`npm run test:unit` includes the WASM and native fidelity tests when their ignored
artifacts are present; artifact-dependent suites are skipped when they are absent.
`npm run test:e2e` starts its own Vite development server. The preview suite runs
a fresh production build before exercising gesture-gated playback, WebMCP,
import/export, effects, and responsive layouts against `vite preview`.

Individual commands:

| Command | Purpose |
|---|---|
| `npm run setup:first-run` | Install dependencies, fetch Vital, build WASM, and verify production output |
| `npm run dev -- --strictPort` | Start the development server on the configured port |
| `npm run build` | Type-check and create `dist/` |
| `npm run preview` | Serve the existing production bundle locally |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run test:unit` | Run Vitest, including available WASM/native suites |
| `npm run test:e2e` | Run all Playwright tests against the development server |
| `npm run test:e2e:preview` | Build and run the selected production-preview Playwright tests |

## License and source

Wavetable Workbench is distributed under the GNU General Public License version
3 or later (`GPL-3.0-or-later`). The browser artifact incorporates modified Vital
source from `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836`,
copyright 2013-2019 Matt Tytel. See [`LICENSE`](LICENSE) for the terms and
[`NOTICE`](NOTICE) for incorporated source areas, the exact patch list, and
corresponding-source rebuild instructions. The distribution metadata test keeps
`package.json`, `NOTICE`, `wasm/vital/UPSTREAM.json`, the patch directory, and the
pinned fetch/build commands aligned.

## Troubleshooting

- **Node.js is unsupported:** install Node.js `^20.19.0` or `>=22.12.0`, verify `node --version`, and rerun `npm run setup:first-run`.
- **Homebrew is missing:** install it from [brew.sh](https://brew.sh/) or install CMake, Ninja, and Python 3 manually before rerunning setup.
- **The emsdk directory is invalid:** set `EMSDK_DIR` to an empty path or an existing emsdk Git checkout. The script refuses to overwrite an unrelated directory.
- **The Vital checkout is at the wrong commit:** remove the ignored `vendor/vital/` checkout and rerun `npm run setup:first-run`; the fetch script checks commit `636ca0e` before building.
- **`emcmake` is unavailable during a manual build:** source the active SDK's `emsdk_env.sh` in the same terminal, then rerun `bash wasm/vital/build.sh`.
- **`npm run build` reports a missing `vital.mjs` or `vital.wasm`:** run `npm run setup:first-run`, or activate emsdk and run the manual WASM rebuild commands. The production check is intentional; generated binaries are not stored in Git.
- **The server does not start:** rerun `npm ci` and inspect Vite's terminal output. With `--strictPort`, stop the process using port `4173` before retrying.
- **Audio is suspended or silent:** click **Hold C2** directly, check the tab mute state and output device, then reload and try the gesture again.
- **Playwright cannot find Chromium:** run `npx playwright install chromium`; on Linux, the environment may also need `npx playwright install-deps chromium`.
- **WebMCP is unavailable or no tools appear:** confirm the testing flag is enabled, relaunch Chrome, keep the workbench as the active top-level tab, reload it, and reopen the Inspector. Browser flags and extension UI can change, so consult the current [Chrome WebMCP documentation][webmcp-docs] if the named controls have moved.
- **Vital export is disabled:** confirm `fixtures/vital/init.vital` exists and the app reports **Vital fixture ready**; check the browser console and network panel for fixture loading errors.

[inspector]: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
[webmcp-docs]: https://developer.chrome.com/docs/ai/webmcp
