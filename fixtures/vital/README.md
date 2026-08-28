# Vital Init Fixture

`init.vital` is the pinned JSON template cloned by the Vital exporter. It
provides the preset structure and supported settings that exported patches
modify.

## Compatibility and evidence

Vital `1.0.7` is the pinned compatibility target. The serialized version fields
and owner-supplied macOS app-bundle metadata identify `1.0.7`; on 2026-08-27,
the user also confirmed that a Wavetable Workbench export loaded in that
installed version.

The fixture's original creator, creation date, save environment, and
redistribution basis are not recorded. The available evidence does not prove
that the unmodified fixture was created or reopened in Vital `1.0.7`, or that
it is compatible with other Vital versions.

## Updating the fixture

Replace it only with a fresh Init preset saved by the chosen target version.
Record the version, date, operating system, creation method, and redistribution
basis; confirm both the fixture and a representative export load in that
version; then run `npm run test:unit -- tests/vital` and update this note.

## Browser preview limitation

The browser preview and Vital use different synthesis and rendering engines.
The preview indicates the musical direction of edits, but it is not timbrally
or sample-level identical to Vital; the confirmed export sounded substantially
richer and different in Vital.

## Pinned export mappings

- Vital `1.0.7` stores envelope delay/attack/hold/decay/release controls as fourth roots; exports encode logical seconds with `seconds ** 0.25` and tests decode with `raw ** 4`.
- Free delay stores log2 frequency with an inverted seconds display, so exports use `log2(1 / seconds)`; synchronized delay uses tempo indexes `6..12` for `1/1..1/64`, with sync mode `3` for retained triplets.
- Vital LFO point Y coordinates are UI coordinates: logical `0..1` values export as `1 - y`, so low remains low and high remains high when Vital decodes the shape.
- Vital `1.0.7` has no fixture-backed LFO enable key. Disabled logical LFOs keep their exported routes and amounts but set those route slots' `modulation_N_bypass` to `1`.
- The one logical amp envelope maps to ENV 1, the modulation envelope maps to ENV 2, and both oscillators use destination `0` (Filter 1). Filter 2 is forced off; extra envelopes and unsupported Filter 2 settings remain at Init values.
