"""Birthday-only arrangement layer.

The Studio sonifier produces a melody + bass + harmony arpeggio per NASA
point, which sounds *correct* but flat — there is no dynamic arc, no
sustained pad, no extra phrasing.  For a gift we want it to feel like a
real piece of music: a soft intro, a build, a climax, then a tender
outro, plus an optional pad / arpeggio layer that gives the FluidSynth
render real "production" character.

This module is **additive**: it only enriches the existing event list
(velocity envelope, ritardando) and appends new `layer="pad"` /
`layer="arp"` events that the MIDI writer + WAV synth pick up from
optional tracks.  The Studio pipeline does NOT call this — it is a
birthday-style-only enhancement.

Inputs and outputs are pure dicts; the function never mutates the
caller's list.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional

from services.music_styles import MusicStyle

# ---------------------------------------------------------------------------
# Envelope shapes per birthday style
# ---------------------------------------------------------------------------
# Each profile is (intro_end_frac, climax_start_frac, climax_end_frac,
#                  intro_scale, climax_scale, outro_scale)
# - intro_scale: floor velocity scale at song start
# - climax_scale: peak velocity scale (1.0 = original, >1.0 boosts then clips)
# - outro_scale: tail-out velocity scale at song end
# Studio styles (calm/pop/study/cinematic) fall back to a gentle bell so
# any non-birthday style still benefits if someone calls this directly.
_ENVELOPES: Dict[str, Dict[str, float]] = {
    "celebration": {
        "intro_end": 0.10, "climax_start": 0.35, "climax_end": 0.85,
        "intro_scale": 0.70, "climax_scale": 1.08, "outro_scale": 0.62,
    },
    "tender": {
        "intro_end": 0.15, "climax_start": 0.40, "climax_end": 0.78,
        "intro_scale": 0.55, "climax_scale": 0.92, "outro_scale": 0.45,
    },
    "anthem": {
        "intro_end": 0.15, "climax_start": 0.42, "climax_end": 0.86,
        "intro_scale": 0.50, "climax_scale": 1.18, "outro_scale": 0.55,
    },
    "waltz": {
        "intro_end": 0.12, "climax_start": 0.38, "climax_end": 0.82,
        "intro_scale": 0.65, "climax_scale": 0.96, "outro_scale": 0.50,
    },
    "nebula": {
        "intro_end": 0.25, "climax_start": 0.45, "climax_end": 0.75,
        "intro_scale": 0.60, "climax_scale": 0.85, "outro_scale": 0.45,
    },
}

# Pad / arpeggio profile per birthday style.
# pad_phrase: how many events one pad note spans (longer => smoother chords)
# pad_program: GM program number for the pad layer (override; 0=>style harmony)
# arp_subdiv: subdivisions per beat for the arpeggio layer (0 disables arp)
# arp_program: GM program for the arpeggio layer
# pad_octave: transpose pad relative to chord-root register
_LAYER_PROFILES: Dict[str, Dict[str, Any]] = {
    "celebration": {
        "pad_phrase": 4, "pad_program": 88, "pad_octave": 0,    # Pad 1 (new age)
        "arp_subdiv": 4, "arp_program": 11, "arp_pattern": (0, 7, 12, 7),  # Vibraphone 16ths
        "pad_vel_scale": 0.55, "arp_vel_scale": 0.42,
    },
    "tender": {
        "pad_phrase": 6, "pad_program": 89, "pad_octave": -12,  # Pad 2 (warm)
        "arp_subdiv": 2, "arp_program": 46, "arp_pattern": (0, 7, 12),    # Harp 8ths
        "pad_vel_scale": 0.60, "arp_vel_scale": 0.30,
    },
    "anthem": {
        "pad_phrase": 4, "pad_program": 48, "pad_octave": 0,    # String Ensemble 1
        "arp_subdiv": 3, "arp_program": 56, "arp_pattern": (0, 4, 7, 12), # Trumpet triplets
        "pad_vel_scale": 0.62, "arp_vel_scale": 0.46,
    },
    "waltz": {
        "pad_phrase": 6, "pad_program": 48, "pad_octave": -12,  # Strings (low)
        "arp_subdiv": 2, "arp_program": 6, "arp_pattern": (0, 7, 12, 7),  # Harpsichord
        "pad_vel_scale": 0.45, "arp_vel_scale": 0.42,
    },
    "nebula": {
        # Heavy pad — nebula's entire personality.
        "pad_phrase": 8, "pad_program": 95, "pad_octave": -7,   # Pad 8 (sweep)
        "arp_subdiv": 0, "arp_program": 0, "arp_pattern": (),    # no arp
        "pad_vel_scale": 0.72, "arp_vel_scale": 0.0,
    },
}

# Generic fallback so the function is safe to call with any style.
_FALLBACK_ENVELOPE = _ENVELOPES["celebration"]
_FALLBACK_PROFILE = _LAYER_PROFILES["celebration"]


def _envelope_scale(pos: float, prof: Dict[str, float]) -> float:
    """Piecewise-smooth velocity envelope.

    pos in [0, 1]. Returns a multiplier in roughly [0.45, 1.2] depending
    on the profile.  Cosine fades keep transitions inaudible.
    """
    intro_end = prof["intro_end"]
    climax_start = prof["climax_start"]
    climax_end = prof["climax_end"]
    intro_scale = prof["intro_scale"]
    climax_scale = prof["climax_scale"]
    outro_scale = prof["outro_scale"]
    if pos <= intro_end:
        # Rise from intro_scale -> (intro_scale + climax_scale)/2 by intro_end
        frac = pos / max(intro_end, 1e-6)
        smooth = 0.5 - 0.5 * math.cos(math.pi * frac)
        target = intro_scale + (climax_scale - intro_scale) * 0.45 * smooth
        return target
    if pos < climax_start:
        # Build phase
        frac = (pos - intro_end) / max(climax_start - intro_end, 1e-6)
        smooth = 0.5 - 0.5 * math.cos(math.pi * frac)
        base = intro_scale + (climax_scale - intro_scale) * 0.45
        return base + (climax_scale - base) * smooth
    if pos <= climax_end:
        # Climax plateau with a tiny wave so it doesn't feel static
        wobble = 1.0 + 0.04 * math.sin(pos * 23.0)
        return climax_scale * wobble
    # Outro
    frac = (pos - climax_end) / max(1.0 - climax_end, 1e-6)
    smooth = 0.5 - 0.5 * math.cos(math.pi * min(1.0, frac))
    return climax_scale + (outro_scale - climax_scale) * smooth


def _apply_velocity_envelope(
    events: List[Dict[str, Any]],
    style_id: str,
) -> None:
    """In-place velocity scaling. `events` must be the already-copied list."""
    if not events:
        return
    prof = _ENVELOPES.get(style_id, _FALLBACK_ENVELOPE)
    n = len(events)
    for i, ev in enumerate(events):
        pos = i / max(n - 1, 1)
        scale = _envelope_scale(pos, prof)
        v0 = float(ev.get("velocity", 70))
        v = int(round(max(8.0, min(127.0, v0 * scale))))
        ev["velocity"] = v


def _apply_ritardando(events: List[Dict[str, Any]], style_id: str) -> None:
    """Stretch the last few event durations to mimic a slow-down + final breath."""
    if len(events) < 4:
        return
    # Per-style emotional weight of the closing gesture.
    weights = {
        "celebration": (1.10, 1.25, 1.55),
        "tender":      (1.20, 1.45, 1.85),
        "anthem":      (1.25, 1.55, 1.95),
        "waltz":       (1.10, 1.30, 1.65),
        "nebula":      (1.35, 1.70, 2.20),
    }.get(style_id, (1.10, 1.25, 1.55))

    # Stretch last 3 events; we DO NOT shift earlier times because the
    # event list timestamps drive bass/harmony alignment.  The pad/arp
    # layers anchored to those events get the extension automatically.
    for offset, factor in zip((3, 2, 1), weights):
        idx = len(events) - offset
        if idx < 0:
            continue
        ev = events[idx]
        ev["duration"] = float(ev["duration"]) * factor


# ---------------------------------------------------------------------------
# Pad + Arpeggio layer generation
# ---------------------------------------------------------------------------
def _chord_root_from_event(ev: Dict[str, Any]) -> int:
    """Best-effort chord root pitch from the symphonic event.

    We prefer the dedicated `bass_note` (one octave below the chord),
    transposed back up so the pad sits in the mid register.  Failing
    that, we fall back to `base_note`.
    """
    bass = ev.get("bass_note")
    if isinstance(bass, (int, float)):
        return int(bass) + 12  # back to mid register
    base = ev.get("base_note")
    if isinstance(base, (int, float)):
        return int(base)
    return 60


def _emit_pad_events(
    events: List[Dict[str, Any]],
    style: MusicStyle,
    style_id: str,
    avg_velocity: float,
) -> List[Dict[str, Any]]:
    """Generate one pad event per phrase (group of N source events)."""
    if not events:
        return []
    profile = _LAYER_PROFILES.get(style_id, _FALLBACK_PROFILE)
    phrase = max(1, int(profile["pad_phrase"]))
    pad_vel_scale = float(profile["pad_vel_scale"])
    pad_octave = int(profile["pad_octave"])
    pad_program = int(profile["pad_program"])

    pad_events: List[Dict[str, Any]] = []
    for i in range(0, len(events), phrase):
        chunk = events[i : i + phrase]
        if not chunk:
            continue
        start = float(chunk[0]["time"])
        last = chunk[-1]
        end = float(last["time"]) + float(last["duration"])
        dur = max(0.5, end - start)
        root = _chord_root_from_event(chunk[0]) + pad_octave
        root = max(36, min(84, root))
        # Slightly average the velocity across the chunk so the pad
        # "breathes" with the melody.
        chunk_vel = sum(float(e.get("velocity", avg_velocity)) for e in chunk) / len(chunk)
        v = int(round(max(20.0, min(110.0, chunk_vel * pad_vel_scale))))
        pad_events.append({
            "layer": "pad",
            "time": start,
            "duration": dur,
            "note": int(root),
            "velocity": v,
            "program": pad_program,
        })
    return pad_events


def _emit_arp_events(
    events: List[Dict[str, Any]],
    style: MusicStyle,
    style_id: str,
    avg_velocity: float,
    rng: random.Random,
) -> List[Dict[str, Any]]:
    """Generate an arpeggio pass over each chord event.

    The arp respects the per-style `arp_subdiv` (subdivisions per beat)
    and walks the configured pattern (semitone offsets above the chord
    root).  Disabled when `arp_subdiv` is 0 (nebula).
    """
    profile = _LAYER_PROFILES.get(style_id, _FALLBACK_PROFILE)
    subdiv = int(profile.get("arp_subdiv", 0))
    if subdiv <= 0:
        return []
    pattern = tuple(profile.get("arp_pattern") or ())
    if not pattern:
        return []
    arp_program = int(profile["arp_program"])
    arp_vel_scale = float(profile["arp_vel_scale"])
    step = 1.0 / float(subdiv)

    arp_events: List[Dict[str, Any]] = []
    for ev in events:
        t0 = float(ev["time"])
        dur = float(ev["duration"])
        # Don't spam the climax: cap arp hits per event so the texture stays musical.
        max_hits = max(2, int(math.floor(dur / step)))
        max_hits = min(max_hits, 16)
        # Slightly fewer hits when source event velocity is low (intro/outro).
        ev_v = float(ev.get("velocity", avg_velocity))
        if ev_v < avg_velocity * 0.75:
            max_hits = max(2, int(max_hits * 0.6))
        root = _chord_root_from_event(ev)
        for k in range(max_hits):
            offset = pattern[k % len(pattern)]
            # Gentle pitch jitter so a long phrase doesn't sound like a loop.
            jitter = rng.choice((-12, 0, 0, 0, 0, 12))
            pitch = max(48, min(96, root + offset + jitter))
            t = t0 + k * step
            if t + step > t0 + dur:
                break
            v = int(round(max(18.0, min(95.0, ev_v * arp_vel_scale))))
            arp_events.append({
                "layer": "arp",
                "time": t,
                "duration": step * 0.85,
                "note": pitch,
                "velocity": v,
                "program": arp_program,
            })
    return arp_events


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def apply_birthday_arrangement(
    events: List[Dict[str, Any]],
    style: MusicStyle,
    *,
    seed: int,
    enable_pad: bool = True,
    enable_arp: bool = True,
) -> List[Dict[str, Any]]:
    """Return a NEW event list with envelope + pad + arpeggio + ritardando.

    Original events are deep-copied so callers can keep referencing the
    untouched baseline (used by sonification metrics / piano roll diff).
    """
    if not events:
        return events
    out: List[Dict[str, Any]] = [dict(e) for e in events]
    style_id = (style.id or "").strip().lower()

    _apply_velocity_envelope(out, style_id)
    _apply_ritardando(out, style_id)

    avg_v = sum(float(e.get("velocity", 70)) for e in out) / max(len(out), 1)
    rng = random.Random((int(seed) + 9001) & 0xFFFFFFFF)
    extra: List[Dict[str, Any]] = []
    if enable_pad:
        extra.extend(_emit_pad_events(out, style, style_id, avg_v))
    if enable_arp:
        extra.extend(_emit_arp_events(out, style, style_id, avg_v, rng))

    out.extend(extra)
    return out


def style_has_drums(style_id: str) -> bool:
    """Birthday style controller for drum suppression.

    `nebula` is intentionally drum-less ("your planet has been drifting
    in silence since you were born") so the drum track should be empty.
    All other birthday styles keep their persona-derived drum bed.
    """
    return (style_id or "").strip().lower() != "nebula"
