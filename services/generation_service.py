from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

from scripts.data_fetcher import fetch_or_load_dataset
from scripts.hybrid_audio import mix_with_nasa_background, render_events_to_wav
from scripts.sonifier import generate_note_events, save_symphony_midi_from_events
from services.fluid_render import render_midi_to_wav
from services.harmony_engine import compute_sonification_metrics
from services.music_styles import get_style
from services.planet_drone_synth import (
    drone_signature,
    estimate_drone_duration_sec,
    render_planet_drone_wav,
)
from services.sonification_explanation import build_sonification_explanation

MixMode = Literal["baseline", "ai"]


@dataclass
class MixOptions:
    nasa_background_wav: Optional[str] = None
    fg_gain: float = 0.85
    bg_gain: float = 0.35
    fade_ms: int = 80
    ducking: bool = True
    ducking_strength: float = 0.45


def _artifact_base(planet: str, mode: str, style_id: str) -> str:
    return f"{planet.lower()}_{mode}_{style_id}"


def _events_to_piano_roll(events) -> dict:
    """Flatten arrangement events into a compact piano-roll payload.

    Each layer in `LAYERS` becomes one channel; the frontend renders them
    with different colors. We cap to 600 notes total so the response never
    bloats past a few KB even on long windows.
    """
    notes: list[dict] = []
    arp_step = 0.09
    for ev in events:
        t = float(ev["time"])
        dur = float(ev["duration"])
        vel = int(ev["velocity"])
        base_note = int(ev["base_note"])
        lead_note = int(ev["lead_note"])
        bass = int(ev.get("bass_note", base_note - 12))
        notes.append({"t": round(t, 4), "d": round(dur, 4), "p": base_note, "v": vel, "layer": "melody"})
        lead_dur = max(0.12, min(dur * 0.5, dur - 0.04))
        notes.append({"t": round(t, 4), "d": round(lead_dur, 4), "p": lead_note, "v": max(32, vel - 22), "layer": "lead"})
        notes.append({"t": round(t, 4), "d": round(min(dur * 1.15, dur + 0.35), 4), "p": bass, "v": min(100, max(42, vel + 8)), "layer": "bass"})
        for hi, h_note in enumerate(ev.get("harmony", [])):
            h_t = t + hi * arp_step
            h_dur = max(0.18, dur * 0.75 - hi * 0.04)
            notes.append({"t": round(h_t, 4), "d": round(h_dur, 4), "p": int(h_note), "v": max(22, vel - 38), "layer": "harmony"})
    if not notes:
        return {"notes": [], "duration_beats": 0.0, "pitch_min": 60, "pitch_max": 72}
    if len(notes) > 600:
        notes = notes[:600]
    duration_beats = max(n["t"] + n["d"] for n in notes)
    pitches = [n["p"] for n in notes]
    return {
        "notes": notes,
        "duration_beats": round(duration_beats, 3),
        "pitch_min": min(pitches),
        "pitch_max": max(pitches),
    }


def _try_fluid_hq(
    midi_path: str,
    outputs_dir: str,
    base: str,
    soundfont_path: Optional[str],
    fluidsynth_bin: str,
) -> tuple[Optional[str], Optional[str]]:
    if not soundfont_path:
        return None, None
    out_hq = f"{outputs_dir}/{base}_hq.wav"
    ok, err = render_midi_to_wav(
        midi_path, out_hq, soundfont_path, fluidsynth_bin=fluidsynth_bin
    )
    if ok:
        return out_hq, None
    return None, err


def _render_hybrid_if_needed(
    wav_path: str,
    planet: str,
    mode: MixMode,
    style_id: str,
    outputs_dir: str,
    mix_options: MixOptions,
) -> Optional[str]:
    if not mix_options.nasa_background_wav:
        return None
    base = _artifact_base(planet, mode, style_id)
    return mix_with_nasa_background(
        generated_wav=wav_path,
        background_wav=mix_options.nasa_background_wav,
        output_path=f"{outputs_dir}/{base}_hybrid.wav",
        fg_gain=mix_options.fg_gain,
        bg_gain=mix_options.bg_gain,
        fade_ms=mix_options.fade_ms,
        ducking=mix_options.ducking,
        ducking_strength=mix_options.ducking_strength,
    )


def generate_artifacts(
    planet: str,
    days: int,
    seed: int,
    data_dir: str,
    outputs_dir: str,
    mix_options: MixOptions,
    mode: MixMode = "ai",
    style_id: str = "calm",
    soundfont_path: Optional[str] = None,
    fluidsynth_bin: str = "fluidsynth",
    lstm_checkpoint_path: Optional[str] = None,
    lstm_device: str = "cpu",
    lstm_temperature: float = 0.92,
) -> Dict[str, Any]:
    dataset, data_path, cached = fetch_or_load_dataset(
        planet_name=planet, days_count=days, data_dir=data_dir
    )
    if not dataset["points"]:
        raise ValueError("No points returned from NASA.")
    points = dataset["points"]
    events = generate_note_events(
        points, seed=seed, mode=mode, style_id=style_id, planet_name=planet
    )
    lstm_meta: Dict[str, Any] = {}
    ckpt = (lstm_checkpoint_path or "").strip()
    if ckpt:
        from services.lstm_blend import apply_lstm_checkpoint_to_events

        events, lstm_meta = apply_lstm_checkpoint_to_events(
            events,
            points,
            style_id,
            seed,
            ckpt,
            device=lstm_device,
            planet_name=planet,
            temperature=lstm_temperature,
        )
    st = get_style(style_id)
    mid_suffix = f"{mode}_{st.id}_symphony"
    midi_path = save_symphony_midi_from_events(
        events, planet, style_id, outputs_dir, filename_suffix=mid_suffix
    )
    base = _artifact_base(planet, mode, style_id)

    # `drone` bypasses the MIDI/FluidSynth pipeline entirely.  The pads
    # FluidSynth would play are still *melodic* instruments with note
    # attacks; for a "realistic planet sound" we render pure synthesis
    # (sub-bass stack + filtered noise + spectral shimmer + reverb tail).
    # The events + MIDI above are kept so the piano-roll preview still
    # has something to draw.
    drone_meta: Optional[Dict[str, Any]] = None
    if style_id == "drone":
        duration_sec = estimate_drone_duration_sec(events, st.bpm)
        drone_wav = render_planet_drone_wav(
            f"{outputs_dir}/{base}_melody.wav",
            planet,
            duration_sec=duration_sec,
            points=points,
            seed=seed,
        )
        wav_path = drone_wav
        # The drone synth IS the high-quality render — point both at it
        # rather than running FluidSynth (which would produce melodic pads).
        hq_wav: Optional[str] = drone_wav
        hq_err: Optional[str] = None
        drone_meta = {
            "duration_sec": round(duration_sec, 2),
            **drone_signature(planet),
        }
    else:
        wav_path = render_events_to_wav(
            events, f"{outputs_dir}/{base}_melody.wav", bpm=st.bpm, style_id=style_id
        )
        hq_wav, hq_err = _try_fluid_hq(
            midi_path, outputs_dir, base, soundfont_path, fluidsynth_bin
        )
    hybrid_path = _render_hybrid_if_needed(
        wav_path, planet, mode, style_id, outputs_dir, mix_options
    )
    metrics = compute_sonification_metrics(events)

    explanation = build_sonification_explanation(
        planet=planet,
        style_id=style_id,
        points=points,
        events=events,
        days=days,
        seed=seed,
        mode=mode,
        lstm_meta=lstm_meta,
    )

    out: Dict[str, Any] = {
        "planet": planet,
        "mode": mode,
        "style": style_id,
        "count": dataset["count"],
        "metadata": dataset.get("metadata", {}),
        "data_json": data_path,
        "data_cached": cached,
        "midi": midi_path,
        "melody_wav": wav_path,
        "melody_hq_wav": hq_wav,
        "hybrid_wav": hybrid_path,
        "sonification_metrics": metrics,
        "piano_roll": _events_to_piano_roll(events),
        "bpm": st.bpm,
        "explanation": explanation,
    }
    if hq_err:
        out["fluid_render_warning"] = hq_err
    if lstm_meta:
        out["lstm_blend"] = lstm_meta
    if drone_meta is not None:
        out["drone_signature"] = drone_meta
    return out


def compare_modes(
    planet: str,
    days: int,
    seed: int,
    data_dir: str,
    outputs_dir: str,
    mix_options: MixOptions,
    style_id: str = "calm",
    soundfont_path: Optional[str] = None,
    fluidsynth_bin: str = "fluidsynth",
    lstm_checkpoint_path: Optional[str] = None,
    lstm_device: str = "cpu",
    lstm_temperature: float = 0.92,
) -> Dict[str, Any]:
    dataset, data_path, cached = fetch_or_load_dataset(
        planet_name=planet, days_count=days, data_dir=data_dir
    )
    if not dataset["points"]:
        raise ValueError("No points returned from NASA.")
    points = dataset["points"]
    st = get_style(style_id)

    baseline_events = generate_note_events(
        points, seed=seed, mode="baseline", style_id=style_id, planet_name=planet
    )
    b_base = _artifact_base(planet, "baseline", style_id)
    baseline_midi = save_symphony_midi_from_events(
        baseline_events,
        planet,
        style_id,
        outputs_dir,
        filename_suffix=f"baseline_{st.id}_symphony",
    )
    if style_id == "drone":
        b_drone_dur = estimate_drone_duration_sec(baseline_events, st.bpm)
        baseline_wav = render_planet_drone_wav(
            f"{outputs_dir}/{b_base}_melody.wav",
            planet,
            duration_sec=b_drone_dur,
            points=points,
            seed=seed,
        )
        bl_hq: Optional[str] = baseline_wav
        bl_hq_err: Optional[str] = None
    else:
        baseline_wav = render_events_to_wav(
            baseline_events,
            f"{outputs_dir}/{b_base}_melody.wav",
            bpm=st.bpm,
            style_id=style_id,
        )
        bl_hq, bl_hq_err = _try_fluid_hq(
            baseline_midi, outputs_dir, b_base, soundfont_path, fluidsynth_bin
        )
    baseline_hybrid = _render_hybrid_if_needed(
        baseline_wav, planet, "baseline", style_id, outputs_dir, mix_options
    )
    baseline_metrics = compute_sonification_metrics(baseline_events)

    ai_events = generate_note_events(
        points, seed=seed, mode="ai", style_id=style_id, planet_name=planet
    )
    lstm_ai_meta: Dict[str, Any] = {}
    ckpt = (lstm_checkpoint_path or "").strip()
    if ckpt:
        from services.lstm_blend import apply_lstm_checkpoint_to_events

        ai_events, lstm_ai_meta = apply_lstm_checkpoint_to_events(
            ai_events,
            points,
            style_id,
            seed,
            ckpt,
            device=lstm_device,
            planet_name=planet,
            temperature=lstm_temperature,
        )
    a_base = _artifact_base(planet, "ai", style_id)
    ai_midi = save_symphony_midi_from_events(
        ai_events,
        planet,
        style_id,
        outputs_dir,
        filename_suffix=f"ai_{st.id}_symphony",
    )
    if style_id == "drone":
        a_drone_dur = estimate_drone_duration_sec(ai_events, st.bpm)
        # Vary the seed for the ai render so the two waveforms aren't bit-identical.
        ai_wav = render_planet_drone_wav(
            f"{outputs_dir}/{a_base}_melody.wav",
            planet,
            duration_sec=a_drone_dur,
            points=points,
            seed=seed + 17,
        )
        ai_hq: Optional[str] = ai_wav
        ai_hq_err: Optional[str] = None
    else:
        ai_wav = render_events_to_wav(
            ai_events, f"{outputs_dir}/{a_base}_melody.wav", bpm=st.bpm, style_id=style_id
        )
        ai_hq, ai_hq_err = _try_fluid_hq(
            ai_midi, outputs_dir, a_base, soundfont_path, fluidsynth_bin
        )
    ai_hybrid = _render_hybrid_if_needed(
        ai_wav, planet, "ai", style_id, outputs_dir, mix_options
    )
    ai_metrics = compute_sonification_metrics(ai_events)

    fluid_warn = None
    for msg in (bl_hq_err, ai_hq_err):
        if msg:
            fluid_warn = (fluid_warn + "; " if fluid_warn else "") + msg

    result: Dict[str, Any] = {
        "planet": planet,
        "days": days,
        "seed": seed,
        "style": style_id,
        "data_json": data_path,
        "data_cached": cached,
        "count": dataset["count"],
        "metadata": dataset.get("metadata", {}),
        "bpm": st.bpm,
        "baseline": {
            "midi": baseline_midi,
            "melody_wav": baseline_wav,
            "melody_hq_wav": bl_hq,
            "hybrid_wav": baseline_hybrid,
            "sonification_metrics": baseline_metrics,
            "piano_roll": _events_to_piano_roll(baseline_events),
            "explanation": build_sonification_explanation(
                planet=planet,
                style_id=style_id,
                points=points,
                events=baseline_events,
                days=days,
                seed=seed,
                mode="baseline",
            ),
        },
        "ai": {
            "midi": ai_midi,
            "melody_wav": ai_wav,
            "melody_hq_wav": ai_hq,
            "hybrid_wav": ai_hybrid,
            "sonification_metrics": ai_metrics,
            "piano_roll": _events_to_piano_roll(ai_events),
            "explanation": build_sonification_explanation(
                planet=planet,
                style_id=style_id,
                points=points,
                events=ai_events,
                days=days,
                seed=seed,
                mode="ai",
                lstm_meta=lstm_ai_meta,
            ),
        },
        "lstm_blend_ai": lstm_ai_meta if ckpt else None,
        "comparison_summary": {
            "repetition_rate_delta": round(
                ai_metrics.get("repetition_rate", 0)
                - baseline_metrics.get("repetition_rate", 0),
                4,
            ),
            "unique_pitch_ratio_delta": round(
                ai_metrics.get("unique_pitch_ratio", 0)
                - baseline_metrics.get("unique_pitch_ratio", 0),
                4,
            ),
            "mean_step_delta": round(
                ai_metrics.get("mean_melodic_step_semitones", 0)
                - baseline_metrics.get("mean_melodic_step_semitones", 0),
                4,
            ),
        },
    }
    if fluid_warn:
        result["fluid_render_warning"] = fluid_warn
    return result
