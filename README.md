# Wavetable Workbench

Wavetable Workbench is a React/Vite prototype for editing one synth patch from
the UI or Chrome WebMCP, auditioning a functional browser preview, and exporting
a `.vital` preset.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`, with npm
- Chrome with WebMCP testing enabled, plus the [Model Context Tool Inspector][inspector], for the WebMCP workflow
- Vital only for loading and auditioning exported presets

## Install and run

From the repository root:

```bash
npm ci
npm run dev -- --strictPort
```

Open the URL printed by Vite. The checked-in development configuration currently
uses `http://127.0.0.1:4173`.

Set a safe output level, then click **Hold C2** (MIDI note 48) to start audio. Browser autoplay
rules require this direct user gesture; a WebMCP tool call cannot start audio.
The browser keeps the existing `0.72` voice-bus headroom and adds exactly `2x`
post-effects output gain (`+6.02 dB`) before a `-1 dB`, `20:1` peak limiter.
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
.vital**. Load the downloaded file in your local Vital installation. Vital and
the browser use different synthesis engines, but the preview mirrors the pinned
Vital parameter direction, destination ranges, quadratic oscillator-level encoding,
unison behavior, curve shapes, and equal-power effect mixes. It should preserve
the exported patch's character and movement, though it is not sample-identical.

Use the header's starting-patch dropdown for a starting point. **Import Vital** imports
the documented Vital `1.0.7` subset exactly and falls back to a warning-rich lossy
conversion for structurally valid older or feature-rich `.vital` files. A successful
import replaces only the selected A/B variant as one undoable transaction. Malformed
files leave the patch and history unchanged.

### Browser/Vital calibration ladder

The **Calibration ladder** group in the starting-patch menu contains eight cumulative
test patches. A is one retriggered sine oscillator with a neutral gate envelope; B adds
the custom Air Spectrum wavetable; C adds ADSR; D adds deterministic unison; E enables
the filter; F adds quarter-note LFO gating; G enables OSC2; and H enables delay and
reverb. Parameters for later stages are already configured while bypassed, so each step
activates only the subsystem named in its title. Both oscillator controls are fixed at
the workbench's `100%` reference level throughout the ladder.

For each letter, press A or hold C2 (MIDI note 48) in the browser, listen, export the
preset, then press A at the same keyboard-octave setting in Vital at a matched output
level. Release and retrigger the note after changing stages.
After each note-on, the audition panel reports input-to-voice time, voice-graph build
time, browser latency properties, the render quantum, and estimated first-sample and
envelope threshold times. Start audio before comparing notes so the one-time context
startup cost is not mixed into the steady-state result. The same structured sample is
available in DevTools as `window.__WAVETABLE_WORKBENCH_NOTE_TIMING__`. The output and
envelope figures are clock-based estimates, not an acoustic loopback measurement.
Oscillator level uses the workbench's `0–100%` range without altering browser gain.
At the Vital boundary only, `100%` maps to Vital's effective level `0.5`; export writes
`sqrt(workbenchLevel × 0.5)` to Vital's quadratic raw parameter and import reverses it.
Thus `71%` exports as an effective Vital level of approximately `0.355`.
Unison detune is also quadratic in Vital: the workbench's `0–100%` span is
`0–24` cents and maps to Vital's displayed/effective `0–12%` span. Calibration
D's `25%` therefore loads as `3%` in Vital, with the same approximately six-cent
outer-voice detune as the browser.
The first strongly different pair is the useful result: A/B points at oscillator or
wavetable rendering, C at envelope curves, D at unison, E at the filter, F at LFO
mapping/timing, G at oscillator summing, and H at the effects chain. D deliberately
keeps random phase at zero, and every stage ignores note velocity, so repeated trials
are stable.

The exporter clones `fixtures/vital/init.vital`; dependency installation does
not create or replace it. See [`fixtures/vital/README.md`](fixtures/vital/README.md)
for fixture evidence, provenance limitations, and compatibility records.

## Checks

Install Playwright's Chromium binary once if needed, then run the checked-in
scripts:

```bash
npx playwright install chromium
npm run test:unit
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

The end-to-end suite starts its own Vite server. `npm run build` type-checks the
project and writes the production bundle to `dist/`.

## Troubleshooting

- **The server does not start:** use a supported Node.js version, rerun `npm ci`, and inspect Vite's terminal output. With `--strictPort`, a busy configured port is an error; without it, use the alternate URL Vite prints.
- **Audio is suspended or silent:** click **Hold C2** directly, check the tab mute state and output device, then reload and try the gesture again.
- **WebMCP is unavailable or no tools appear:** confirm the testing flag is enabled, relaunch Chrome, keep the workbench as the active top-level tab, reload it, and reopen the Inspector. Browser flags and extension UI can change, so consult the current [Chrome WebMCP documentation][webmcp-docs] if the named controls have moved.
- **Vital export is disabled:** confirm `fixtures/vital/init.vital` exists and the app reports **Vital fixture ready**; check the browser console and network panel for fixture loading errors.

[inspector]: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
[webmcp-docs]: https://developer.chrome.com/docs/ai/webmcp
