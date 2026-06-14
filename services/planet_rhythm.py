"""
Per-planet × per-style rhythm DNA: spacing, grid, accents, drums stay distinct
so Mars/pop ≠ Jupiter/pop even with similar NASA curves.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass
from typing import Dict

from scripts.data_fetcher import PLANET_IDS

StyleKey = str  # calm | pop | study | cinematic

# Orbital «character» anchors; pair-specific CRC32 jitter is layered on top.
_ANCHOR: Dict[str, Dict[str, float]] = {
    "Mercury": {"step": 0.82, "wobble": 1.22, "dur": 0.92},
    "Venus": {"step": 1.04, "wobble": 0.86, "dur": 1.06},
    "Earth": {"step": 1.0, "wobble": 1.0, "dur": 1.0},
    "Mars": {"step": 0.9, "wobble": 1.12, "dur": 0.96},
    "Jupiter": {"step": 1.22, "wobble": 0.72, "dur": 1.12},
    "Saturn": {"step": 1.1, "wobble": 0.8, "dur": 1.08},
    "Uranus": {"step": 0.88, "wobble": 1.28, "dur": 0.94},
    "Neptune": {"step": 1.06, "wobble": 0.94, "dur": 1.1},
}

_STYLE_STEP: Dict[StyleKey, float] = {
    "calm": 1.02,
    "pop": 0.9,
    "study": 1.12,
    "cinematic": 0.96,
}
_STYLE_WOB: Dict[StyleKey, float] = {
    "calm": 0.92,
    "pop": 1.05,
    "study": 0.78,
    "cinematic": 1.0,
}
_STYLE_DUR: Dict[StyleKey, float] = {
    "calm": 1.05,
    "pop": 0.94,
    "study": 1.15,
    "cinematic": 1.0,
}


@dataclass(frozen=True)
class PlanetStyleRhythm:
    step_base_mul: float
    wobble_mul: float
    quantize_grid_mul: float
    min_gap_mul: float
    strict_pulse_mul: float
    duration_mul: float
    accent_shift16: int
    drum_phase_beats: float
    drum_velocity_scale: float
    sync_mod: int
    sync_phase: int
    sync_step_mul: float


def normalize_planet(name: str) -> str:
    raw = (name or "Earth").strip()
    if not raw:
        return "Earth"
    cap = raw[0].upper() + raw[1:].lower() if len(raw) > 1 else raw.upper()
    if cap in PLANET_IDS:
        return cap
    low = raw.lower()
    for p in PLANET_IDS:
        if p.lower() == low:
            return p
    return "Earth"


def get_planet_style_rhythm(planet_name: str, style_id: str) -> PlanetStyleRhythm:
    from services.music_styles import resolve_engine_persona

    p = normalize_planet(planet_name)
    # Birthday styles inherit one of the 4 base personas; resolve here so
    # the (planet × persona) jitter table stays well-defined.
    s = resolve_engine_persona(style_id)
    if s not in _STYLE_STEP:
        s = "calm"

    key = f"{p}|{s}".encode("utf-8")
    x = zlib.crc32(key) & 0xFFFFFFFF

    def u8(shift: int) -> float:
        return ((x >> shift) & 255) / 255.0

    u0, u1, u2, u3 = u8(0), u8(8), u8(16), u8(24)
    u4 = ((x >> 4) & 0xFFF) / 4095.0

    a = _ANCHOR.get(p, _ANCHOR["Earth"])
    step_mul = (
        a["step"]
        * _STYLE_STEP[s]
        * (0.9 + 0.2 * u0)
    )
    wobble_mul = (
        a["wobble"]
        * _STYLE_WOB[s]
        * (0.82 + 0.36 * u1)
    )
    dur_mul = (
        a["dur"]
        * _STYLE_DUR[s]
        * (0.88 + 0.24 * u2)
    )

    q_mul = 0.82 + 0.38 * u3
    q_mul = max(0.55, min(1.45, q_mul))

    min_gap_mul = 0.88 + 0.28 * u4
    min_gap_mul = max(0.65, min(1.35, min_gap_mul))

    strict_mul = 0.78 + 0.44 * u0
    strict_mul = max(0.55, min(1.35, strict_mul))

    accent_shift16 = (x >> 11) & 15
    drum_phase = ((x >> 19) & 31) / 32.0 * 0.5
    drum_vel = 0.82 + 0.34 * u2
    drum_vel = max(0.72, min(1.18, drum_vel))

    sync_mod = (x % 5) + 3
    sync_phase = (x >> 7) & 3
    sync_mul = 0.82 + 0.36 * u1
    if sync_mul >= 1.0:
        sync_mul = 1.0 + (sync_mul - 1.0) * 0.55
    else:
        sync_mul = 0.72 + (sync_mul - 0.82) * 0.8

    return PlanetStyleRhythm(
        step_base_mul=max(0.52, min(1.68, step_mul)),
        wobble_mul=max(0.38, min(1.78, wobble_mul)),
        quantize_grid_mul=q_mul,
        min_gap_mul=min_gap_mul,
        strict_pulse_mul=strict_mul,
        duration_mul=max(0.65, min(1.48, dur_mul)),
        accent_shift16=accent_shift16,
        drum_phase_beats=drum_phase,
        drum_velocity_scale=drum_vel,
        sync_mod=int(sync_mod),
        sync_phase=int(sync_phase),
        sync_step_mul=max(0.68, min(1.32, sync_mul)),
    )
