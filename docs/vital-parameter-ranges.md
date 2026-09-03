# Vital 1.0.7 parameter facts

These values are pinned to `mtytel/vital@636ca0ef517a4db087a6a08a6a8a5e704e21f836`,
the revision fetched by `wasm/vital/fetch-source.sh`. Source paths below are relative to
that checkout under `vendor/vital/`.

Vital's `ValueDetails` entries have the shape `name, version, min, max, default,
display offset, display scale, ...`. Unless noted otherwise, the ranges below are the
stored parameter ranges from those entries rather than their displayed units.

## Parameter ranges and enum values

| Workbench concern | Pinned Vital value | Source |
|---|---|---|
| Analog FX filter, 24 dB style | `filter_fx_model = 0` (Analog), `filter_fx_style = 1` (24 dB). Style 0 is 12 dB. | Analog is model index 0 in `src/common/synth_constants.h:113`; the ordered labels are in `src/interface/look_and_feel/synth_strings.h:88`; `src/interface/editor_sections/filter_section.cpp:34` confirms Analog uses that style list. |
| `filter_fx_cutoff` | MIDI-note range `8..136`; default `60`. | The grouped filter `cutoff` declaration is `src/common/synth_parameters.cpp:421`; `src/common/synth_parameters.cpp:570` applies it to the `fx` group. |
| `filter_fx_drive` | `0..20` dB; default `0`. | `src/common/synth_parameters.cpp:425`, grouped for `fx` at `src/common/synth_parameters.cpp:574`. |
| `filter_fx_keytrack` | `-1..1`; default `0`; displayed as percent. The workbench intentionally exposes only `0..1` and maps it identically, so zero means no keytracking. | `src/common/synth_parameters.cpp:437`, grouped for `fx` at `src/common/synth_parameters.cpp:574`. |
| `env_*_attack_power`, `env_*_decay_power`, `env_*_release_power` | All use `-20..20`. Defaults are `0`, `-2`, and `-2`, respectively. | `src/common/synth_parameters.cpp:362`, `src/common/synth_parameters.cpp:364`, and `src/common/synth_parameters.cpp:366`; envelope grouping starts at `src/common/synth_parameters.cpp:550`. |
| `distortion_type` | `0` soft clip, `1` hard clip, `3` sine fold, `4` bit crush. (`2` is linear fold and `5` is downsample.) | The enum order is `src/synthesis/effects/distortion.h:44`; the corresponding labels are `src/interface/look_and_feel/synth_strings.h:127`; the parameter range `0..5` is `src/common/synth_parameters.cpp:89`. |
| `distortion_drive` | `-30..30` dB; default `0`. The workbench's unipolar drive control maps to the non-attenuating `0..30` dB half of this range. | The parameter uses `Distortion::kMinDrive`/`kMaxDrive` at `src/common/synth_parameters.cpp:91`; the constants are defined at `src/synthesis/effects/distortion.h:26`. |
| `chorus_feedback` | `-0.95..0.95`; default `0.4`. The workbench's unipolar feedback maps to `0..0.95`. | `src/common/synth_parameters.cpp:245`. |
| `chorus_cutoff` / `chorus_spread` | Cutoff is `8..136`, default `60`; spread is `0..1`, default `1`. Both remain forced at their defaults because the workbench does not model them. | `src/common/synth_parameters.cpp:247` and `src/common/synth_parameters.cpp:249`. |
| `chorus_frequency` | `-6..3`, exponential time/frequency control; default `-3`. | `src/common/synth_parameters.cpp:253`. |
| `chorus_mod_depth` | `0..1`; default `0.5`. | `src/common/synth_parameters.cpp:259`. |
| `chorus_voices` | Integer `1..4`; default `4`. | `src/common/synth_parameters.cpp:251`. |
| `chorus_sync` / `chorus_tempo` | Sync is indexed `0..3`, default `1`; tempo is indexed `0..10`, default `4`. `chorus_sync = 0` selects the free-running `chorus_frequency` modeled by the workbench. | `src/common/synth_parameters.cpp:255` and `src/common/synth_parameters.cpp:257`; `src/synthesis/modules/chorus_module.cpp:46`-`47` wires frequency through the tempo-sync switch. |
| `chorus_delay_1` / `chorus_delay_2` | Both use `-10..-5.64386`; defaults are `-9` and `-7`. They remain forced at those defaults because the workbench does not model them. | `src/common/synth_parameters.cpp:261` and `src/common/synth_parameters.cpp:263`. |
| Six `compressor_{low,band,high}_{upper,lower}_threshold` controls | All use `-80..0` dB. Init defaults are upper: low `-28`, band `-25`, high `-30`; lower: low `-35`, band `-36`, high `-35`. The workbench amount lowers every Init default by the shared `COMPRESSOR_THRESHOLD_OFFSET_DB = 20` dB at amount 1. | `src/common/synth_parameters.cpp:267`, `src/common/synth_parameters.cpp:269`, `src/common/synth_parameters.cpp:271`, `src/common/synth_parameters.cpp:273`, `src/common/synth_parameters.cpp:275`, and `src/common/synth_parameters.cpp:277`. |
| `compressor_on` | Indexed `0..1`; default `0` (off). This is an ordinary workbench scalar binding, not a forced constant. | `src/common/synth_parameters.cpp:265`. |
| `compressor_attack` / `compressor_release` | Both use `0..1`; defaults are `0.5`. | `src/common/synth_parameters.cpp:297` and `src/common/synth_parameters.cpp:299`. |
| `compressor_enabled_bands` | Indexed `0..3`; default `0`. The exposed values are `0` multiband, `1` low band, and `2` high band; Vital's `3` single-band mode is not exposed. | Range/default: `src/common/synth_parameters.cpp:301`; enum order: `src/synthesis/effects/compressor.h:102`; labels: `src/interface/look_and_feel/synth_strings.h:48`. |
| `compressor_mix` | `0..1`; default `1`. | `src/common/synth_parameters.cpp:303`. |
| `reverb_delay` | `0..0.3` seconds; default `0`. | `src/common/synth_parameters.cpp:149`. |
| `reverb_pre_low_cutoff` | MIDI-note range `0..128`; default `0`. | `src/common/synth_parameters.cpp:135`. |
| `reverb_pre_high_cutoff` | MIDI-note range `0..128`; default `110`. | `src/common/synth_parameters.cpp:137`. |
| `lfo_1_smooth_time` / `lfo_2_smooth_time` | `-10..4`, exponential seconds control; default `-7.5`. | The grouped LFO `smooth_time` declaration is `src/common/synth_parameters.cpp:387`; the loop at `src/common/synth_parameters.cpp:554` applies it to every LFO slot. |
| `lfo_2_phase` | `0..1`; default `0`. | The grouped LFO `phase` declaration is `src/common/synth_parameters.cpp:373`; the loop at `src/common/synth_parameters.cpp:554` applies it to LFO 2. |
| `lfo_2_sync_type` | Indexed `0..SynthLfo::kNumSyncTypes - 1`; default `0`. The workbench forces looping mode `0`. | The grouped declaration is `src/common/synth_parameters.cpp:375`; the loop at `src/common/synth_parameters.cpp:554` applies it to LFO 2. |
| `lfo_2_frequency` | `-7..9`, exponential time/frequency control; default `1`. | The grouped declaration is `src/common/synth_parameters.cpp:377`; the loop at `src/common/synth_parameters.cpp:554` applies it to LFO 2. |
| `lfo_2_sync` / `lfo_2_tempo` | Sync is indexed `0..SynthLfo::kNumSyncOptions - 1`, default `1`; tempo is indexed `0..12`, default `7`. | The grouped declarations are `src/common/synth_parameters.cpp:379` and `src/common/synth_parameters.cpp:381`; the loop at `src/common/synth_parameters.cpp:554` applies them to LFO 2. |
| `osc_N_pan` | `-1..1`; default `0`; displayed as percent. Applies to all three oscillator groups. | `src/common/synth_parameters.cpp:470`; oscillator grouping is `src/common/synth_parameters.cpp:562`. |
| `voice_transpose` | Integer semitones `-48..48`; default `0`. | `src/common/synth_parameters.cpp:119`. |

## `volume` modulation destination

`volume` is a legal mono modulation destination in the pinned build. The synth engine
registers it with `createMonoModControl("volume")` in
`src/synthesis/synth_engine/sound_engine.cpp:115`, then feeds that control into the final
`SmoothVolume` processor at `src/synthesis/synth_engine/sound_engine.cpp:116`. Its
parameter declaration is present at `src/common/synth_parameters.cpp:201`.

Phase 2 can therefore use one `lfo1 -> volume` route; the per-oscillator fallback from D13
is not required.

## Forced-constant ownership audit

`src/vital/parameterMap.ts` currently writes the following values unconditionally. None
is an accidental copy of the Init fixture: each encodes a deliberate limitation or
routing invariant of the workbench model and should be marked `forced` in the Phase 3
binding registry.

| Forced setting | Classification and rationale | Evidence |
|---|---|---|
| `osc_1_destination = 3` | **Forced invariant:** route oscillator 1 directly to the effects chain. The workbench models one global FX filter rather than Vital's two per-voice filters. | Destination index 3 is `kEffects` in `src/common/synth_constants.h:61`; the UI label order confirms it at `src/interface/look_and_feel/synth_strings.h:268`. |
| `osc_2_destination = 3` | **Forced invariant:** same routing contract for oscillator 2. This intentionally overrides Vital's upstream default of destination 1. | The grouped default override is `src/common/synth_parameters.cpp:587`; destination semantics are `src/common/synth_constants.h:61`. |
| `osc_3_destination = 3` | **Forced invariant:** same routing contract for oscillator 3; in this case Vital's own default also happens to be 3. | The grouped default is `src/common/synth_parameters.cpp:588`; destination semantics are `src/common/synth_constants.h:61`. |
| `filter_1_on = 0` | **Forced invariant:** disable unsupported per-voice filter 1; filtering is represented by `filter_fx_*`. | Vital creates separate numbered and `fx` filter groups at `src/common/synth_parameters.cpp:570` and `src/common/synth_parameters.cpp:574`. |
| `filter_2_on = 0` | **Forced invariant:** disable unsupported per-voice filter 2 for the same reason. | Vital creates two numbered filter groups before the FX group at `src/common/synth_parameters.cpp:570`. |
| `filter_fx_mix = 1` | **Forced invariant:** the workbench filter has enabled/type/cutoff/resonance but no wet/dry mix, so enabled filtering is fully wet. | Filter mix supports `0..1` and defaults to 1 at `src/common/synth_parameters.cpp:419`; D4 deliberately defers exposing it. |
| `eq_on = 0` | **Forced invariant:** EQ is in Vital's effect set but has no V1 workbench state. | EQ is a distinct effect in `src/common/synth_constants.h:100`; the workbench must keep unmodelled processing off for deterministic export/import. |
| `flanger_on = 0` | **Forced invariant:** flanger is in Vital's effect set but has no workbench state. | Flanger is a distinct effect in `src/common/synth_constants.h:100`; it is intentionally outside the workbench effect model. |
| `phaser_on = 0` | **Forced invariant:** phaser is in Vital's effect set but has no workbench state. | Phaser is a distinct effect in `src/common/synth_constants.h:100`; it is intentionally outside the workbench effect model. |
| `chorus_sync = 0` | **Forced invariant:** select free-running chorus frequency so the modeled rate reaches DSP instead of the unmodeled tempo control. | `src/synthesis/modules/chorus_module.cpp:46`-`47` creates the frequency control and passes it through the chorus tempo-sync switch; sync range/default are `src/common/synth_parameters.cpp:255`. |
| `chorus_cutoff = 60` | **Forced invariant:** retain Vital's default for the unmodeled chorus filter cutoff. | Range and default are `src/common/synth_parameters.cpp:247`. |
| `chorus_spread = 1` | **Forced invariant:** retain Vital's default for the unmodeled chorus filter spread. | Range and default are `src/common/synth_parameters.cpp:249`. |
| `chorus_delay_1 = -9` | **Forced invariant:** retain Vital's default for the first unmodeled chorus delay. | Range and default are `src/common/synth_parameters.cpp:261`. |
| `chorus_delay_2 = -7` | **Forced invariant:** retain Vital's default for the second unmodeled chorus delay. | Range and default are `src/common/synth_parameters.cpp:263`. |
| `lfo_1_sync_type = 0` | **Forced invariant:** LFO 1 is always the looping/free-running trigger mode represented by the workbench. | `sync_type` is an indexed LFO parameter whose default is 0 at `src/common/synth_parameters.cpp:375`; D8 makes looping an explicit model invariant rather than editable state. |
| `lfo_2_sync_type = 0` | **Forced invariant:** LFO 2 uses the same looping trigger mode represented by the workbench. | `sync_type` is declared at `src/common/synth_parameters.cpp:375`; the grouping loop at `src/common/synth_parameters.cpp:554` applies it to LFO 2. |

The three effect-off values match the Init fixture, but their ownership is still
`forced`: changing an unsupported Vital effect in an imported preset must not preserve
hidden processing that `PatchState` cannot describe.
