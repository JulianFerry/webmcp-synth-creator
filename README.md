# Wavetable Workbench

Wavetable Workbench is a React/Vite application for editing one synth patch from
the UI or Chrome WebMCP, auditioning it through Vital's DSP in a browser
`AudioWorklet`, and exporting a `.vital` preset. Browser playback and export
consume the same adapter-generated Vital document.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`, with npm
- emsdk `3.1.64`, CMake `3.22` or newer, Ninja, Git, and gzip to build the ignored Vital WASM artifact
- Chrome with WebMCP testing enabled, plus the [Model Context Tool Inspector][inspector], for the WebMCP workflow
- Desktop Vital 1.0.7 only for manual export and fidelity checks

## Install and run

From the repository root:

```bash
npm ci
source /path/to/emsdk/emsdk_env.sh
bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
npm run dev -- --strictPort
```

Install and activate emsdk `3.1.64` before sourcing `emsdk_env.sh`; exact commands
and native-reference details are in [`wasm/vital/README.md`](wasm/vital/README.md).
The fetched checkout and generated artifacts are intentionally ignored, so a
fresh clone must run the two Vital build commands before starting the app or
creating a production distribution.

Open the URL printed by Vite. The checked-in development configuration currently
uses `http://127.0.0.1:4173`.

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

Use the header's starting-patch dropdown for a starting point. **Import Vital** imports
the documented Vital `1.0.7` subset exactly and falls back to a warning-rich lossy
conversion for structurally valid older or feature-rich `.vital` files. A successful
import replaces only the selected A/B variant as one undoable transaction. Malformed
files leave the patch and history unchanged.

### Browser/Vital calibration ladder

The **Calibration ladder** group in the starting-patch menu contains eight cumulative
test patches. A is one retriggered sine oscillator with a neutral gate envelope; B adds
the custom Air Spectrum wavetable; C adds ADSR; D adds deterministic unison; E enables
the filter; F adds eighth-note LFO gating; G enables OSC2; and H enables delay and
reverb. Parameters for later stages are already configured while bypassed, so each step
activates only the subsystem named in its title. Both oscillator controls are fixed at
the workbench's `100%` reference level throughout the ladder.

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
state or wavetable compatibility, C at envelopes, D at unison, E at the filter, F at
LFO mapping/timing, G at oscillator summing, and H at the effects chain. D deliberately
keeps random phase at zero, and every stage ignores note velocity, so repeated trials
are stable.

The automated Phase 5 reference uses MIDI 60, velocity `100 / 127`, 120 BPM, a
2-second hold, and a 3-second release/tail at 48 kHz for both WASM and the native
same-source renderer. See [`docs/vital-wasm-fidelity.md`](docs/vital-wasm-fidelity.md)
for measured tolerances, browser costs, native build instructions, and the completed
desktop Vital 1.0.7 listening matrix.

The exporter clones `fixtures/vital/init.vital`; dependency installation does
not create or replace it. See [`fixtures/vital/README.md`](fixtures/vital/README.md)
for fixture evidence, provenance limitations, and compatibility records.

## Checks

Install Playwright's Chromium binary once if needed, then run the checked-in
scripts:

```bash
npx playwright install chromium
bash wasm/vital/fetch-source.sh
bash wasm/vital/build.sh
npm run test:unit
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

The end-to-end suite starts its own Vite server. `npm run build` type-checks the
project and writes the production bundle to `dist/`. A production build fails if
the Vital module is absent and distributes `vital.mjs`, `vital.wasm`,
`fixtures/vital/init.vital`, `LICENSE`, and `NOTICE`.

## License and source

Wavetable Workbench is distributed under the GNU General Public License version
3 or later (`GPL-3.0-or-later`). The browser artifact incorporates modified Vital
source from `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836`,
copyright 2013-2019 Matt Tytel. See [`LICENSE`](LICENSE) for the terms and
[`NOTICE`](NOTICE) for incorporated source areas, the exact patch list, and
corresponding-source rebuild instructions.

## Troubleshooting

- **The server does not start:** use a supported Node.js version, rerun `npm ci`, and inspect Vite's terminal output. With `--strictPort`, a busy configured port is an error; without it, use the alternate URL Vite prints.
- **Vital WASM is unavailable:** activate emsdk `3.1.64`, confirm CMake and Ninja are on `PATH`, then rerun `bash wasm/vital/fetch-source.sh` and `bash wasm/vital/build.sh`.
- **Audio is suspended or silent:** click **Hold C2** directly, check the tab mute state and output device, then reload and try the gesture again.
- **WebMCP is unavailable or no tools appear:** confirm the testing flag is enabled, relaunch Chrome, keep the workbench as the active top-level tab, reload it, and reopen the Inspector. Browser flags and extension UI can change, so consult the current [Chrome WebMCP documentation][webmcp-docs] if the named controls have moved.
- **Vital export is disabled:** confirm `fixtures/vital/init.vital` exists and the app reports **Vital fixture ready**; check the browser console and network panel for fixture loading errors.

[inspector]: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
[webmcp-docs]: https://developer.chrome.com/docs/ai/webmcp
