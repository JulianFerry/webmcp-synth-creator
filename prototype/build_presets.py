import base64
import copy
import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "work" / "reference" / "analog.vital"
OUTPUT = ROOT / "outputs" / "Vital_AI_Scratch_Test_Pack"


def normalize(samples):
    peak = max(abs(x) for x in samples) or 1.0
    return [x / peak for x in samples]


def wave_data(fn):
    samples = normalize([fn(i / 2048.0) for i in range(2048)])
    raw = struct.pack("<2048f", *samples)
    return base64.b64encode(raw).decode("ascii")


def harmonic_wave(partials):
    return wave_data(
        lambda phase: sum(
            amplitude * math.sin(2.0 * math.pi * harmonic * phase + phase_offset)
            for harmonic, amplitude, phase_offset in partials
        )
    )


WAVES = {
    "sine": harmonic_wave([(1, 1.0, 0.0)]),
    "triangle": harmonic_wave(
        [(n, ((-1) ** ((n - 1) // 2)) / (n * n), 0.0) for n in range(1, 32, 2)]
    ),
    "warm_saw": harmonic_wave([(n, 1.0 / n, 0.0) for n in range(1, 40)]),
    "soft_square": harmonic_wave([(n, 1.0 / n, 0.0) for n in range(1, 32, 2)]),
    "glass": harmonic_wave(
        [(1, 1.0, 0.0), (2, 0.42, 0.2), (3, 0.18, 0.0), (7, 0.24, 0.4), (11, 0.09, 0.0)]
    ),
    "air": harmonic_wave(
        [(1, 1.0, 0.0), (2, 0.30, 0.1), (4, 0.16, 0.0), (8, 0.08, 0.2), (13, 0.05, 0.0)]
    ),
}


def wavetable(name, frames):
    keyframes = []
    if len(frames) == 1:
        positions = [0]
    else:
        positions = [round(i * 256 / (len(frames) - 1)) for i in range(len(frames))]
    for position, frame in zip(positions, frames):
        keyframes.append({"position": position, "wave_data": WAVES[frame]})
    return {
        "author": "OpenAI",
        "full_normalize": True,
        "groups": [{
            "components": [{
                "interpolation": 1,
                "interpolation_style": 1,
                "keyframes": keyframes,
                "type": "Wave Source",
            }]
        }],
        "name": name,
        "remove_all_dc": True,
        "version": "1.0.7",
    }


def gate_lfo():
    # Four syncopated pulses across one cycle, with tiny ramps to avoid clicks.
    points = [
        0.000, 0.00, 0.012, 1.00, 0.170, 0.88, 0.205, 0.00,
        0.250, 0.00, 0.262, 0.92, 0.405, 0.72, 0.440, 0.00,
        0.500, 0.00, 0.512, 1.00, 0.670, 0.84, 0.705, 0.00,
        0.750, 0.00, 0.762, 0.78, 0.905, 0.64, 0.940, 0.00,
        1.000, 0.00,
    ]
    count = len(points) // 2
    return {"name": "Ethereal Gate", "num_points": count, "points": points,
            "powers": [0.0] * count, "smooth": False}


def triangle_lfo(name="Triangle"):
    return {"name": name, "num_points": 3,
            "points": [0.0, 0.0, 0.5, 1.0, 1.0, 0.0],
            "powers": [0.0, 0.0, 0.0], "smooth": True}


def set_values(settings, values):
    unknown = sorted(set(values) - set(settings))
    if unknown:
        raise KeyError(f"Unknown Vital settings: {unknown}")
    settings.update(values)


def add_mod(settings, slot, source, destination, amount, bipolar=0.0, stereo=0.0, power=0.0):
    settings["modulations"][slot - 1] = {"source": source, "destination": destination}
    settings[f"modulation_{slot}_amount"] = amount
    settings[f"modulation_{slot}_bipolar"] = bipolar
    settings[f"modulation_{slot}_stereo"] = stereo
    settings[f"modulation_{slot}_power"] = power
    settings[f"modulation_{slot}_bypass"] = 0.0


def fresh_patch(template, name, style, comments):
    patch = copy.deepcopy(template)
    patch.update({
        "author": "OpenAI",
        "comments": comments,
        "macro1": "MACRO 1",
        "macro2": "MACRO 2",
        "macro3": "MACRO 3",
        "macro4": "MACRO 4",
        "preset_name": name,
        "preset_style": style,
        "synth_version": "1.0.7",
    })
    s = patch["settings"]

    for key in s:
        if key.endswith("_on"):
            s[key] = 0.0
        if key.startswith("modulation_") and key.endswith("_amount"):
            s[key] = 0.0
        if key.startswith("modulation_") and key.endswith("_bypass"):
            s[key] = 0.0
    s["modulations"] = [{"destination": "", "source": ""} for _ in s["modulations"]]
    s["wavetables"] = [
        wavetable("AI Sine", ["sine"]),
        wavetable("AI Sine", ["sine"]),
        wavetable("AI Sine", ["sine"]),
    ]
    s["lfos"] = [triangle_lfo() for _ in s["lfos"]]
    set_values(s, {
        "beats_per_minute": 2.0,
        "polyphony": 16.0,
        "legato": 0.0,
        "portamento_force": 0.0,
        "portamento_scale": 0.0,
        "portamento_slope": 0.0,
        "portamento_time": -10.0,
        "velocity_track": 0.25,
        "stereo_mode": 0.0,
        "stereo_routing": 1.0,
        "volume": 5200.0,
        "osc_1_on": 1.0,
        "osc_1_level": 0.62,
        "osc_1_unison_voices": 1.0,
        "osc_1_unison_detune": 3.0,
        "osc_1_unison_blend": 0.8,
        "osc_1_stereo_spread": 1.0,
        "osc_1_random_phase": 1.0,
        "osc_2_on": 0.0,
        "osc_3_on": 0.0,
        "sample_on": 0.0,
        "filter_1_on": 0.0,
        "filter_2_on": 0.0,
        "filter_fx_on": 0.0,
        "chorus_on": 0.0,
        "compressor_on": 0.0,
        "delay_on": 0.0,
        "distortion_on": 0.0,
        "eq_on": 0.0,
        "flanger_on": 0.0,
        "phaser_on": 0.0,
        "reverb_on": 0.0,
    })
    return patch


def ethereal_gate(template):
    p = fresh_patch(
        template, "AI Ethereal Gate", "Pad",
        "Original from-scratch ethereal gated trance pad. LFO 1 creates the rhythmic gate; designed at 120-140 BPM.",
    )
    p.update({"macro1": "GATE DEPTH", "macro2": "AIR", "macro3": "SPACE", "macro4": "WIDTH"})
    s = p["settings"]
    s["wavetables"] = [wavetable("AI Air Saw", ["warm_saw", "air"]), wavetable("AI Glass Air", ["triangle", "glass"]), wavetable("AI Sine", ["sine"])]
    s["lfos"][0] = gate_lfo()
    set_values(s, {
        "polyphony": 16.0,
        "osc_1_level": 0.08,
        "osc_1_wave_frame": 88.0,
        "osc_1_unison_voices": 7.0,
        "osc_1_unison_detune": 8.2,
        "osc_1_unison_blend": 0.72,
        "osc_1_stereo_spread": 1.0,
        "osc_2_on": 1.0,
        "osc_2_level": 0.04,
        "osc_2_wave_frame": 70.0,
        "osc_2_transpose": 12.0,
        "osc_2_unison_voices": 3.0,
        "osc_2_unison_detune": 4.2,
        "osc_2_stereo_spread": 0.8,
        "env_1_attack": 0.035,
        "env_1_decay": 0.9,
        "env_1_sustain": 1.0,
        "env_1_release": 0.72,
        "filter_1_on": 1.0,
        "filter_1_cutoff": 78.0,
        "filter_1_resonance": 0.12,
        "filter_1_drive": 3.0,
        "filter_1_keytrack": 0.35,
        "lfo_1_sync": 1.0,
        "lfo_1_sync_type": 0.0,
        "lfo_1_tempo": 5.0,
        "lfo_1_smooth_time": -8.5,
        "chorus_on": 1.0,
        "chorus_dry_wet": 0.32,
        "chorus_feedback": 0.22,
        "chorus_mod_depth": 0.58,
        "chorus_voices": 4.0,
        "delay_on": 1.0,
        "delay_dry_wet": 0.20,
        "delay_feedback": 0.48,
        "delay_sync": 1.0,
        "delay_aux_sync": 1.0,
        "delay_tempo": 8.0,
        "delay_aux_tempo": 9.0,
        "reverb_on": 1.0,
        "reverb_dry_wet": 0.34,
        "reverb_decay_time": 1.55,
        "reverb_size": 0.78,
        "reverb_chorus_amount": 0.27,
        "compressor_on": 1.0,
        "compressor_mix": 0.25,
    })
    add_mod(s, 1, "lfo_1", "osc_1_level", 0.60)
    add_mod(s, 2, "lfo_1", "osc_2_level", 0.32)
    add_mod(s, 3, "lfo_1", "filter_1_cutoff", 0.10)
    return p


def midnight_retro(template):
    p = fresh_patch(
        template, "AI Midnight Neon", "Pad",
        "Original from-scratch dark retro synth-pop pad; evokes nocturnal 1980s atmosphere without copying any artist or song.",
    )
    p.update({"macro1": "BRIGHTNESS", "macro2": "DRIFT", "macro3": "SPACE", "macro4": "WIDTH"})
    s = p["settings"]
    s["wavetables"] = [wavetable("AI Warm Saw", ["warm_saw"]), wavetable("AI Soft Square", ["soft_square"]), wavetable("AI Sine", ["sine"])]
    set_values(s, {
        "polyphony": 12.0,
        "osc_1_level": 0.55,
        "osc_1_unison_voices": 5.0,
        "osc_1_unison_detune": 6.0,
        "osc_1_unison_blend": 0.68,
        "osc_1_stereo_spread": 0.85,
        "osc_2_on": 1.0,
        "osc_2_level": 0.28,
        "osc_2_transpose": -12.0,
        "osc_2_tune": -0.08,
        "osc_2_unison_voices": 2.0,
        "osc_2_unison_detune": 2.1,
        "osc_2_stereo_spread": 0.35,
        "env_1_attack": 0.24,
        "env_1_decay": 1.1,
        "env_1_sustain": 0.82,
        "env_1_release": 1.15,
        "filter_1_on": 1.0,
        "filter_1_cutoff": 62.0,
        "filter_1_resonance": 0.20,
        "filter_1_drive": 7.0,
        "filter_1_keytrack": 0.28,
        "lfo_1_sync": 0.0,
        "lfo_1_frequency": -4.0,
        "lfo_1_stereo": 0.18,
        "chorus_on": 1.0,
        "chorus_dry_wet": 0.44,
        "chorus_feedback": 0.30,
        "chorus_frequency": -4.2,
        "chorus_mod_depth": 0.48,
        "chorus_spread": 0.82,
        "delay_on": 1.0,
        "delay_dry_wet": 0.12,
        "delay_feedback": 0.34,
        "delay_sync": 1.0,
        "delay_aux_sync": 1.0,
        "delay_tempo": 8.0,
        "delay_aux_tempo": 10.0,
        "reverb_on": 1.0,
        "reverb_dry_wet": 0.27,
        "reverb_decay_time": 1.34,
        "reverb_size": 0.66,
        "reverb_high_shelf_gain": -3.0,
        "compressor_on": 1.0,
        "compressor_mix": 0.28,
    })
    add_mod(s, 1, "lfo_1", "filter_1_cutoff", 0.055, bipolar=1.0, stereo=0.14)
    add_mod(s, 2, "lfo_1", "osc_1_tune", 0.006, bipolar=1.0, stereo=0.25)
    return p


def glass_pluck(template):
    p = fresh_patch(
        template, "AI Prism Glass", "Pluck",
        "Original from-scratch bright glassy pluck with a clean transient, crystalline partials, ping-pong delay and short hall tail.",
    )
    p.update({"macro1": "TONE", "macro2": "DECAY", "macro3": "ECHO", "macro4": "SHIMMER"})
    s = p["settings"]
    s["wavetables"] = [wavetable("AI Prism", ["glass", "air"]), wavetable("AI Sine", ["sine"]), wavetable("AI Sine", ["sine"])]
    set_values(s, {
        "polyphony": 10.0,
        "velocity_track": 0.55,
        "osc_1_level": 0.58,
        "osc_1_wave_frame": 36.0,
        "osc_1_unison_voices": 3.0,
        "osc_1_unison_detune": 2.8,
        "osc_1_unison_blend": 0.78,
        "osc_1_stereo_spread": 0.62,
        "osc_2_on": 1.0,
        "osc_2_level": 0.19,
        "osc_2_transpose": 12.0,
        "osc_2_tune": 0.03,
        "env_1_attack": 0.001,
        "env_1_hold": 0.015,
        "env_1_decay": 0.42,
        "env_1_decay_power": -3.3,
        "env_1_sustain": 0.0,
        "env_1_release": 0.48,
        "filter_1_on": 1.0,
        "filter_1_cutoff": 104.0,
        "filter_1_resonance": 0.12,
        "filter_1_keytrack": 0.48,
        "delay_on": 1.0,
        "delay_dry_wet": 0.23,
        "delay_feedback": 0.43,
        "delay_sync": 1.0,
        "delay_aux_sync": 1.0,
        "delay_tempo": 9.0,
        "delay_aux_tempo": 11.0,
        "delay_filter_cutoff": 84.0,
        "reverb_on": 1.0,
        "reverb_dry_wet": 0.25,
        "reverb_decay_time": 1.16,
        "reverb_size": 0.59,
        "reverb_pre_low_cutoff": 30.0,
        "eq_on": 1.0,
        "eq_low_cutoff": 44.0,
        "eq_low_gain": -3.0,
        "eq_high_cutoff": 92.0,
        "eq_high_gain": 2.2,
    })
    return p


def warm_bass(template):
    p = fresh_patch(
        template, "AI Hearth Bass", "Bass",
        "Original from-scratch warm analog-style mono bass: saw body, sine sub, gentle filter-envelope punch and soft saturation.",
    )
    p.update({"macro1": "CUTOFF", "macro2": "BITE", "macro3": "SUB", "macro4": "GLIDE"})
    s = p["settings"]
    s["wavetables"] = [wavetable("AI Warm Saw", ["warm_saw"]), wavetable("AI Sine", ["sine"]), wavetable("AI Soft Square", ["soft_square"])]
    set_values(s, {
        "polyphony": 1.0,
        "legato": 1.0,
        "portamento_force": 0.0,
        "portamento_scale": 0.0,
        "portamento_slope": 0.0,
        "portamento_time": -7.0,
        "velocity_track": 0.34,
        "osc_1_level": 0.56,
        "osc_1_unison_voices": 2.0,
        "osc_1_unison_detune": 1.6,
        "osc_1_unison_blend": 0.92,
        "osc_1_stereo_spread": 0.18,
        "osc_1_random_phase": 0.12,
        "osc_2_on": 1.0,
        "osc_2_level": 0.38,
        "osc_2_transpose": -12.0,
        "osc_2_random_phase": 0.0,
        "env_1_attack": 0.004,
        "env_1_decay": 0.48,
        "env_1_sustain": 0.76,
        "env_1_release": 0.22,
        "env_2_attack": 0.002,
        "env_2_decay": 0.36,
        "env_2_decay_power": -3.0,
        "env_2_sustain": 0.08,
        "env_2_release": 0.20,
        "filter_1_on": 1.0,
        "filter_1_cutoff": 50.0,
        "filter_1_resonance": 0.18,
        "filter_1_drive": 10.0,
        "filter_1_keytrack": 0.38,
        "distortion_on": 1.0,
        "distortion_drive": 4.5,
        "distortion_mix": 0.22,
        "distortion_filter_cutoff": 68.0,
        "compressor_on": 1.0,
        "compressor_mix": 0.34,
        "eq_on": 1.0,
        "eq_low_cutoff": 35.0,
        "eq_low_gain": 1.6,
        "eq_high_cutoff": 78.0,
        "eq_high_gain": -2.0,
    })
    add_mod(s, 1, "env_2", "filter_1_cutoff", 0.24, power=-0.2)
    return p


def main():
    template = json.loads(TEMPLATE.read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    presets = [ethereal_gate(template), midnight_retro(template), glass_pluck(template), warm_bass(template)]
    for preset in presets:
        filename = preset["preset_name"].replace(" ", "_") + ".vital"
        (OUTPUT / filename).write_text(json.dumps(preset, separators=(",", ":")))
    print("\n".join(str(p) for p in sorted(OUTPUT.glob("*.vital"))))


if __name__ == "__main__":
    main()
