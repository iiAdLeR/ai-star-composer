"""
Stage 4 + musical styles: baseline vs AI, scales/presets, anti-repetition memory.
"""
from __future__ import annotations

import math
import random
from collections import deque
from typing import Any, Deque, Dict, List, Literal, Tuple

from services.music_styles import (
    MusicStyle,
    build_markov_for_scale,
    get_style,
    resolve_engine_persona,
)


def _persona(style: MusicStyle) -> str:
    """Engine persona key for `style` — see `music_styles.resolve_engine_persona`."""
    return resolve_engine_persona(style.id)
from services.planet_rhythm import get_planet_style_rhythm
from services.planet_voice import (
    build_effective_scale,
    get_planet_style_voice,
    tilt_speed_norm,
)

Mode = Literal["baseline", "ai"]


def _normalize_values(values: List[float]) -> List[float]:
    min_v = min(values)
    max_v = max(values)
    span = max(max_v - min_v, 1e-9)
    return [(v - min_v) / span for v in values]


def _normalize_column(points: List[Dict], key: str) -> Tuple[List[float], List[float]]:
    values = [float(p.get(key, 0.0)) for p in points]
    return _normalize_values(values), values


def _scale_index(note: int, scale: Tuple[int, ...]) -> int:
    if note in scale:
        return scale.index(note)
    return min(range(len(scale)), key=lambda i: abs(scale[i] - note))


def _map_speed_to_scale(
    speed_norm: float,
    scale: Tuple[int, ...],
    index_rotate: int = 0,
) -> int:
    if not scale:
        return 60
    idx = min(int(speed_norm * len(scale)), len(scale) - 1)
    if index_rotate:
        idx = (idx + int(index_rotate)) % len(scale)
    return scale[idx]


def _clamp_int(value: float, low: int, high: int) -> int:
    return int(max(low, min(high, value)))


def _nearest_scale_note(note: int, scale: Tuple[int, ...]) -> int:
    return min(scale, key=lambda n: abs(n - note))


def _maybe_octave_shift(
    base: int, i: int, rng: random.Random, scale: Tuple[int, ...], probability: float
) -> int:
    if i > 0 and rng.random() < probability:
        shifted = base + (12 if rng.random() > 0.5 else -12)
        return _nearest_scale_note(shifted, scale)
    return base


def _constrain_melodic_leap(
    prev: int | None,
    chosen: int,
    scale: Tuple[int, ...],
    max_leap: int,
) -> int:
    """Keep melody steps small so live stream / export sounds coherent per style."""
    if max_leap <= 0 or prev is None:
        return chosen
    if abs(chosen - prev) <= max_leap:
        return chosen
    lo, hi = prev - max_leap, prev + max_leap
    candidates: List[int] = []
    for octave in range(-4, 5):
        for s in scale:
            n = int(s) + octave * 12
            if lo <= n <= hi:
                candidates.append(n)
    if not candidates:
        target = prev + max(-max_leap, min(max_leap, chosen - prev))
        return _nearest_scale_note(target, scale)
    return min(candidates, key=lambda n: abs(n - chosen))


def _bass_pool(scale: Tuple[int, ...]) -> Tuple[int, ...]:
    low = sorted({s - 12 for s in scale if 36 <= s - 12 <= 58})
    if len(low) >= 2:
        return tuple(low)
    low2 = sorted({s - 24 for s in scale if 28 <= s - 24 <= 50})
    return tuple(low2) if low2 else (40, 43, 45)


def _bass_note(base: int, scale: Tuple[int, ...], step_i: int) -> int:
    """Root motion every few steps + snap to low register scale tones."""
    pool = _bass_pool(scale)
    cycle = (0, max(1, len(scale) // 3), max(2, (2 * len(scale)) // 3))
    anchor = scale[cycle[step_i % 3] % len(scale)]
    target = int((anchor * 0.35 + base * 0.65) - 12)
    return _nearest_scale_note(target, pool)


def _harmony(style: MusicStyle, base: int, radius_norm: float, rng: random.Random) -> List[int]:
    """
    Chord tones snapped to the style scale so stacks stay in-key (pentatonic / diatonic presets).
    Raw tertian intervals often miss pentatonic degrees and sounded consistently 'off'.
    """
    scale = style.scale
    fifth = _nearest_scale_note(base + 7, scale)
    if rng.random() > style.harmony_density:
        return [fifth]

    third = _nearest_scale_note(base + style.third_semitones, scale)
    if third == base:
        idx = _scale_index(base, scale)
        third = scale[(idx + 2) % len(scale)]

    out: List[int] = []
    for n in (third, fifth):
        if n != base and n not in out:
            out.append(n)

    if radius_norm > style.seventh_radius_threshold:
        sev = _nearest_scale_note(base + 10, scale)
        if sev != base and sev not in out:
            out.append(sev)

    return out if out else [fifth]


def _lead_note_from_base(
    base_note: int,
    scale: Tuple[int, ...],
    lead_off: int,
    rng: random.Random,
) -> int:
    """Secondary voice: stay on scale, avoid unison/octave doubling the melody."""
    raw = base_note + lead_off
    lead = _nearest_scale_note(_clamp_int(raw, 40, 95), scale)
    if abs(lead - base_note) < 3 and rng.random() < 0.68:
        bump = 12 if rng.random() > 0.42 else 7
        lead = _nearest_scale_note(base_note + bump, scale)
    return _clamp_int(lead, 48, 91)


def _candidate_notes_ai(
    prev: int | None,
    mapped_note: int,
    markov: Dict[int, List[int]],
    scale: Tuple[int, ...],
) -> List[int]:
    if prev is None:
        return list(dict.fromkeys([mapped_note] + list(scale)))
    from_m = markov.get(prev, list(scale))
    return list(dict.fromkeys([mapped_note, prev] + from_m + list(scale)))


def _score_candidate(
    cand: int,
    mapped_note: int,
    prev_note: int | None,
    recent: Deque[int],
    scale: Tuple[int, ...],
    rng: random.Random,
    style: MusicStyle,
) -> float:
    score = 0.0
    if cand in recent:
        score -= 95.0 * recent.count(cand)
    idx_c = _scale_index(cand, scale)
    idx_m = _scale_index(mapped_note, scale)
    score -= abs(idx_c - idx_m) * 7.5
    score += rng.uniform(0.0, 5.5)
    persona = _persona(style)
    if persona == "pop":
        score += 2.0 if abs(cand - mapped_note) <= 4 else 0.0
    if persona == "study":
        score -= abs(idx_c - idx_m) * 2.0

    if prev_note is not None:
        leap = abs(cand - prev_note)
        score -= leap * 0.5
        if persona == "study":
            score -= leap * 1.35
            score += 3.0 if leap <= 3 else 0.0
        elif persona == "calm":
            score -= leap * 0.65
            score += 2.0 if leap <= 4 else 0.0
        elif persona == "cinematic":
            score += 2.2 if 2 <= leap <= 5 else 0.0
            score -= max(0, leap - 8) * 1.1
        elif persona == "pop":
            score += 1.4 if 2 <= leap <= 8 else 0.0

    return score


def _pick_ai_note(
    mapped_note: int,
    prev: int | None,
    recent: Deque[int],
    rng: random.Random,
    markov: Dict[int, List[int]],
    scale: Tuple[int, ...],
    style: MusicStyle,
) -> int:
    candidates = _candidate_notes_ai(prev, mapped_note, markov, scale)
    best = max(
        candidates,
        key=lambda c: _score_candidate(c, mapped_note, prev, recent, scale, rng, style),
    )
    return _nearest_scale_note(best, scale)


def generate_events(
    points: List[Dict[str, Any]],
    mode: Mode = "ai",
    style_id: str = "calm",
    seed: int = 42,
    planet_name: str = "Earth",
) -> List[Dict[str, Any]]:
    if not points:
        return []

    style = get_style(style_id)
    pr = get_planet_style_rhythm(planet_name, style.id)
    pv = get_planet_style_voice(planet_name, style.id)
    scale = build_effective_scale(style.scale, pv.scale_transpose)
    markov = build_markov_for_scale(scale)
    rng = random.Random(seed)
    idx_rot = int(pv.speed_index_rotate) % max(len(scale), 1)
    leap_cap = style.melodic_max_leap
    if leap_cap > 0:
        leap_cap = max(2, min(18, leap_cap + pv.leap_delta))
    oct_prob = min(0.48, max(0.02, style.octave_shift_probability * pv.octave_prob_mul))

    speed_norm, _ = _normalize_column(points, "speed")
    light_norm, _ = _normalize_column(points, "light_intensity_proxy")
    radial_norm, radial_values = _normalize_column(points, "radial_velocity")
    radius_raw = [float(p.get("radius", 0.0)) for p in points]
    radius_n, _ = _normalize_column(points, "radius")

    events: List[Dict[str, Any]] = []
    prev_note: int | None = None
    recent: Deque[int] = deque(maxlen=style.repeat_memory)

    t = 0.0
    for i, point in enumerate(points):
        sn = tilt_speed_norm(speed_norm[i], pv)
        mapped_note = _map_speed_to_scale(sn, scale, index_rotate=idx_rot)

        if mode == "baseline":
            base_note = mapped_note
        else:
            if prev_note is None:
                base_note = mapped_note
            else:
                base_note = _pick_ai_note(mapped_note, prev_note, recent, rng, markov, scale, style)

        if mode == "ai":
            base_note = _maybe_octave_shift(base_note, i, rng, scale, oct_prob)
            base_note = _constrain_melodic_leap(prev_note, base_note, scale, leap_cap)

        vel = int(
            style.velocity_floor
            + light_norm[i] * style.velocity_light_range * pv.velocity_mul
        )
        vel = _clamp_int(vel, 1, 127)

        dur_span = style.duration_max - style.duration_min
        duration = style.duration_min + dur_span * radial_norm[i]
        dur_w = style.rhythm_wobble * pr.wobble_mul * style.wobble_duration_scale
        wob = 1.0 + dur_w * (rng.random() * 2.0 - 1.0)
        duration = max(0.08, duration * wob * pr.duration_mul)

        if _persona(style) == "pop" and i % 3 == 1:
            duration *= 0.82

        heading_xy = float(point.get("heading_xy", 0.0))
        pan = int(((math.sin(heading_xy) + 1.0) / 2.0) * 127)

        speed_delta = float(point.get("speed_delta", 0.0))
        lead_off = rng.choice(style.lead_options)
        if speed_delta > 0:
            lead_off = max(lead_off, 2)
        elif speed_delta < 0:
            lead_off = min(lead_off, -2)
        lead_note = _lead_note_from_base(int(base_note), scale, lead_off, rng)

        harmony = _harmony(style, base_note, radius_n[i], rng)
        bass_n = _bass_note(base_note, scale, i)

        step_w = style.rhythm_wobble * pr.wobble_mul * style.wobble_step_scale
        step = style.step_base * pr.step_base_mul * (1.0 + step_w * (rng.random() * 2.0 - 1.0))
        persona_id = _persona(style)
        if persona_id == "pop" and i % 4 == 2:
            step *= 0.72
        if persona_id == "study" and i % 5 == 4:
            step *= 1.35
        if pr.sync_mod > 0 and (i + pr.sync_phase) % pr.sync_mod == 0:
            step *= pr.sync_step_mul

        events.append(
            {
                "time": t,
                "duration": duration,
                "base_note": int(base_note),
                "lead_note": int(lead_note),
                "bass_note": int(bass_n),
                "velocity": vel,
                "harmony": harmony,
                "pan": pan,
                "radial_velocity": radial_values[i],
                "speed": float(point.get("speed", 0.0)),
                "radius": radius_raw[i],
                "mode": mode,
                "style": style.id,
            }
        )

        t += step
        recent.append(int(base_note))
        prev_note = int(base_note)

    snap_base = style.duration_snap_grid if style.duration_snap_grid > 0 else style.quantize_grid
    snap_g = max(0.0625, snap_base * pr.quantize_grid_mul)
    for ev in events:
        ev["duration"] = _snap_duration(float(ev["duration"]), snap_g)

    q_grid = max(0.0625, style.quantize_grid * pr.quantize_grid_mul)
    mg = style.quantize_min_gap if style.quantize_min_gap > 0 else max(style.quantize_grid * 0.5, 0.0625)
    mg *= pr.min_gap_mul
    _quantize_event_times(events, q_grid, min_gap=max(0.05, mg))
    if style.strict_pulse_grid > 0:
        sp = max(0.0625, style.strict_pulse_grid * pr.strict_pulse_mul)
        _enforce_strict_pulse(events, sp)
    _apply_metric_accents(events, style, accent_shift16=pr.accent_shift16)
    return events


def re_voice_event_for_base(
    event: Dict[str, Any],
    point: Dict[str, Any],
    lstm_pitch: int,
    step_i: int,
    style: MusicStyle,
    radius_norm: float,
    rng: random.Random,
    planet_name: str = "Earth",
) -> None:
    """Keep timing/velocity/pan from `event`; replace melodic stack from LSTM pitch + style rules."""
    pv = get_planet_style_voice(planet_name, style.id)
    scale = build_effective_scale(style.scale, pv.scale_transpose)
    base = _nearest_scale_note(_clamp_int(float(lstm_pitch), 48, 84), scale)
    event["base_note"] = int(base)
    speed_delta = float(point.get("speed_delta", 0.0))
    lead_off = rng.choice(style.lead_options)
    if speed_delta > 0:
        lead_off = max(lead_off, 2)
    elif speed_delta < 0:
        lead_off = min(lead_off, -2)
    event["lead_note"] = int(_lead_note_from_base(int(base), scale, lead_off, rng))
    event["harmony"] = _harmony(style, int(base), radius_norm, rng)
    event["bass_note"] = int(_bass_note(int(base), scale, step_i))


def blend_lstm_pitches_into_events(
    events: List[Dict[str, Any]],
    points: List[Dict[str, Any]],
    lstm_pitches: List[int],
    style_id: str,
    seed: int,
    planet_name: str = "Earth",
) -> List[Dict[str, Any]]:
    """
    Replace base/lead/harmony/bass using an LSTM pitch stream while preserving quantized timing
    from `generate_events` (symphony-ready).
    """
    style = get_style(style_id)
    rng = random.Random(seed)
    radius_n, _ = _normalize_column(points, "radius")
    n = min(len(events), len(points), len(lstm_pitches))
    for i in range(n):
        re_voice_event_for_base(
            events[i],
            points[i],
            lstm_pitches[i],
            i,
            style,
            radius_n[i],
            rng,
            planet_name=planet_name,
        )
    return events


def _enforce_strict_pulse(events: List[Dict[str, Any]], grid: float) -> None:
    """Keep onsets on-grid and at least `grid` apart (steady pulse)."""
    if grid <= 0 or not events:
        return
    last = -1e9
    for ev in events:
        t = float(ev["time"])
        t = round(t / grid) * grid
        if t < last + grid - 1e-12:
            t = last + grid
        ev["time"] = t
        last = t


def _snap_duration(duration: float, grid: float) -> float:
    if grid <= 0:
        return max(0.08, duration)
    snapped = max(grid, round(duration / grid) * grid)
    return max(0.08, min(snapped, 32.0))


def _quantize_event_times(events: List[Dict[str, Any]], grid: float, min_gap: float = 0.05) -> None:
    if grid <= 0 or not events:
        return
    last = -1e9
    for ev in events:
        t = float(ev["time"])
        tq = round(t / grid) * grid
        if tq < last + min_gap:
            tq = last + min_gap
            if grid > 0:
                tq = round(tq / grid) * grid
                if tq <= last + 1e-9:
                    tq = last + grid
        ev["time"] = tq
        last = tq


def _apply_metric_accents(
    events: List[Dict[str, Any]],
    style: MusicStyle,
    accent_shift16: int = 0,
) -> None:
    """Light velocity pulses on strong beats so grooves read closer to 4/4 (esp. pop)."""
    if not events:
        return
    shift = int(accent_shift16) % 16
    persona = _persona(style)
    for ev in events:
        t = float(ev["time"])
        frac = (t % 4.0 + 4.0) % 4.0
        idx16 = (int(round(frac * 4)) + shift) % 16
        v = int(ev["velocity"])
        if persona == "pop":
            if idx16 in (4, 12):
                v = min(127, v + 16)
            elif idx16 in (0, 8):
                v = min(127, v + 8)
        elif persona == "cinematic":
            if idx16 == 0:
                v = min(127, v + 12)
            elif idx16 in (4, 12):
                v = min(127, v + 6)
        elif persona == "study":
            if idx16 == 0:
                v = min(127, v + 6)
        elif persona == "calm":
            if idx16 == 0:
                v = min(127, v + 4)
        ev["velocity"] = v


def _shannon_entropy(values: List[int]) -> float:
    """Shannon entropy of a discrete sequence, in **bits**.

    Higher entropy ⇒ the sequence carries more information / is less
    predictable. Bounded above by log2(N_distinct). We expose this on
    pitches, melodic intervals, and quantized durations so the report can
    compare baseline vs AI distributions on a single, well-defined scale.
    """
    if not values:
        return 0.0
    counts: Dict[int, int] = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    total = float(len(values))
    entropy = 0.0
    for c in counts.values():
        if c <= 0:
            continue
        p = c / total
        entropy -= p * math.log2(p)
    return entropy


def compute_sonification_metrics(events: List[Dict[str, Any]]) -> Dict[str, float]:
    if not events:
        return {}

    bases = [int(e["base_note"]) for e in events]
    repeats = sum(1 for j in range(1, len(bases)) if bases[j] == bases[j - 1])
    repetition_rate = repeats / max(len(bases) - 1, 1)
    pitch_range = float(max(bases) - min(bases))
    raw_steps = [bases[j] - bases[j - 1] for j in range(1, len(bases))]
    abs_steps = [abs(s) for s in raw_steps]
    mean_step = float(sum(abs_steps) / len(abs_steps)) if abs_steps else 0.0
    harmony_notes = sum(len(e.get("harmony", [])) for e in events)
    harmony_density = harmony_notes / len(events)
    unique_ratio = len(set(bases)) / len(bases)

    # Information-theoretic quality signals (bits).
    pitch_entropy = _shannon_entropy(bases)
    interval_entropy = _shannon_entropy(raw_steps)
    dur_quant = [int(round(float(e["duration"]) * 8.0)) for e in events]  # 1/8 beat bins
    duration_entropy = _shannon_entropy(dur_quant)

    return {
        "repetition_rate": round(repetition_rate, 4),
        "pitch_range_semitones": round(pitch_range, 2),
        "mean_melodic_step_semitones": round(mean_step, 3),
        "harmony_notes_per_step": round(harmony_density, 3),
        "unique_pitch_ratio": round(unique_ratio, 4),
        "pitch_entropy_bits": round(pitch_entropy, 4),
        "interval_entropy_bits": round(interval_entropy, 4),
        "duration_entropy_bits": round(duration_entropy, 4),
        "steps_count": float(len(bases)),
    }
