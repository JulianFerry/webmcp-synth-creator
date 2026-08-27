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
