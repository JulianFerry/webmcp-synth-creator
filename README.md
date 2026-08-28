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

Set a safe output level, then click **Hold C4** to start audio. Browser autoplay
rules require this direct user gesture; a WebMCP tool call cannot start audio.
The browser keeps the existing `0.72` voice-bus headroom and adds exactly `2x`
post-effects output gain (`+6.02 dB`) before a `-1 dB`, `20:1` peak limiter.
Use **Make darker** or WebMCP while the note is held, **Undo transaction** to
revert the latest edit, and **Release C4** when finished.

## Use Chrome WebMCP

1. Enable **WebMCP for testing** at `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.
2. Install and enable the [Model Context Tool Inspector][inspector].
3. Open the Vite URL in a top-level Chrome tab and wait for the app's WebMCP status to read `available`.
4. Open the Inspector side panel with the workbench tab active. It should discover `get_patch` and `apply_patch`.
5. Run `get_patch` with `{}`.
6. Click **Hold C4**, then run `apply_patch` with this complete input object:

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
the browser use different synthesis engines, so use the browser as a functional
preview rather than an expectation of identical sound.

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
- **Audio is suspended or silent:** click **Hold C4** directly, check the tab mute state and output device, then reload and try the gesture again.
- **WebMCP is unavailable or no tools appear:** confirm the testing flag is enabled, relaunch Chrome, keep the workbench as the active top-level tab, reload it, and reopen the Inspector. Browser flags and extension UI can change, so consult the current [Chrome WebMCP documentation][webmcp-docs] if the named controls have moved.
- **Vital export is disabled:** confirm `fixtures/vital/init.vital` exists and the app reports **Vital fixture ready**; check the browser console and network panel for fixture loading errors.

[inspector]: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
[webmcp-docs]: https://developer.chrome.com/docs/ai/webmcp
