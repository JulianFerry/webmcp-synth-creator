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
The browser adapter mirrors the pinned Vital subset's modulation polarity and
destination ranges, quadratic oscillator levels, unison detune/energy/phase
behavior, LFO and envelope curves, and equal-power delay/reverb mixes. The
preview should therefore retain the exported patch's level movement, brightness,
pitch depth, width, and broad envelope/effect balance. Web Audio's oscillator,
biquad filter, static convolution reverb, and output stage are still different
algorithms, so timbral or sample-level identity is not expected. A fresh human
comparison against the pinned Vital version remains required.

## Pinned export mappings

- Vital `1.0.7` stores envelope delay/attack/hold/decay/release controls as fourth roots; exports encode logical seconds with `seconds ** 0.25` and tests decode with `raw ** 4`.
- Free delay stores log2 frequency with an inverted seconds display, so exports use `log2(1 / seconds)`; synchronized delay uses tempo indexes `6..12` for `1/1..1/64`, with sync mode `3` for retained triplets.
- Vital LFO point Y coordinates are UI coordinates: logical `0..1` values export as `1 - y`, so low remains low and high remains high when Vital decodes the shape.
- Vital `1.0.7` has no fixture-backed LFO enable key. Disabled logical LFOs keep their exported routes and amounts but set those route slots' `modulation_N_bypass` to `1`.
- The one logical amp envelope maps to ENV 1, the modulation envelope maps to ENV 2, and both oscillators use destination `0` (Filter 1). Filter 2 is forced off; extra envelopes and unsupported Filter 2 settings remain at Init values.
- Logical glide maps to `portamento_time` as `log2(seconds)`; zero uses Vital's `-10` minimum and imports back as zero.
- Unison detune is a quadratic Vital control. The workbench's linear `0–100%`
  range represents `0–24` outer-voice cents and maps to Vital's effective
  `0–12%` range, stored as `sqrt(workbenchDetune × 12)`.

## Import compatibility boundary

Import first attempts an exact, round-trip-safe conversion against the pinned Vital
`1.0.7` Init structure. If a structurally valid preset uses another Vital version or
changes material outside that subset, the same importer falls back to a lossy
conversion. The lossy path keeps supported controls, bakes current macro values into
supported destinations, reduces Wave Source and Audio File Source material to harmonic
frames, and reports every class of omitted or approximated feature in the UI.

The supported subset is:

- preset name, comments/description, and the exporter style/category names; Vital author is informational, while PatchState tags, modulation route IDs, and non-registry custom wavetable IDs are regenerated with a visible warning;
- oscillator 1 and 2 enablement, workbench `0–100%` level mapped to Vital's effective `0–0.5` range only at the import/export boundary, frame position, transpose, fine tune, unison voices/detune, stereo spread, random phase, and destination `0` through Filter 1;
- one canonical `Wave Source` component per oscillator with 1-64 uniformly positioned keyframes, exactly 2,048 finite little-endian float32 samples per frame, interpolation/style `1`, DC removal, and normalization enabled;
- ENV 1 as the amp envelope, ENV 2 as the modulation envelope, the pinned lowpass Filter 1 model, integer-Hz cutoff, resonance, and Filter 2 off;
- LFO 1's 2-32 sorted points, powers, shape polarity, canonical smoothing, phase, supported sync/triplet divisions or free rate, plus enabled state inferred from consistently bypassed/enabled LFO routes;
- only the closed `lfo_1`/`env_2` source and oscillator level/frame/tune or Filter 1 cutoff destination mappings, with amount and bipolar state; stereo, line mappings, route power, mixed bypass state, and all other source/destination strings are rejected;
- polyphony, legato, glide, velocity tracking, linked left/right delay timing, feedback/mix, and reverb enablement/mix/decay/size.

Oscillator 3, the sample slot, extra wavetable groups/components, nonuniform frame
positions, arbitrary waveform phase, extra LFOs, Filter 2, non-lowpass Filter 1
models, and any other setting changed from Init are outside the boundary. Malformed
JSON, missing structure/version, invalid Base64, wrong frame sizes, non-finite
samples, and out-of-schema values are rejected before a command is committed.

Application-generated tables round-trip exactly by registry identity. Representable
custom tables round-trip as normalized harmonic magnitudes: material below `1e-5`
of the strongest harmonic may be removed, and regenerated samples must remain within
`3e-4` absolute error. Envelope/effect logarithmic conversions are compared within
floating-point tolerance, and filter cutoff is rounded to the nearest whole Hz.
Overall per-frame wavetable gain is not preserved because both engines normalize it.
An enabled LFO with no LFO route imports as disabled because Vital `1.0.7` has no
fixture-backed standalone LFO enable field; this is sonically equivalent until a
route is added. Lossy imports additionally omit oscillator 3, the sample layer,
unsupported modulation routes, extra LFOs, wavetable transforms, Filter 2, alternate
Filter 1 models, and unsupported effects. Imported patches receive a `vital-lossy`
tag whenever that fallback is used.
