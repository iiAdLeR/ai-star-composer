"""
Per-planet × per-style melodic / tonal fingerprint: key shift, speed→pitch mapping,
dynamics — complements `planet_rhythm` so orbits don’t all «feel» the same.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass
from typing import Tuple

from services.planet_rhythm import normalize_planet

StyleKey = str

# Semitone shift anchors (orbital character); pair CRC jitter stacks on top.
_TRANS_ANCHOR: dict[str, int] = {
    "Mercury": 4,
    "Venus": 1,
    "Earth": 0,
    "Mars": -2,
    "Jupiter": -6,
    "Saturn": -4,
    "Uranus": 5,
    "Neptune": 2,
}


@dataclass(frozen=True)
class PlanetStyleVoice:
    scale_transpose: int
    speed_curve_exp: float
    speed_index_rotate: int
    velocity_mul: float
    leap_delta: int
    invert_speed: bool
    octave_prob_mul: float


def build_effective_scale(style_scale: Tuple[int, ...], transpose: int) -> Tuple[int, ...]:
    """Shift preset scale by semitones (new tonal center per planet)."""
    if transpose == 0:
        return style_scale
    out: list[int] = []
    for n in style_scale:
        nn = int(n) + int(transpose)
        nn = max(36, min(91, nn))
        out.append(nn)
    return tuple(sorted(set(out)))


def _style_key(style_id: str) -> StyleKey:
    # Route birthday styles through their declared engine persona so the
    # per-planet voice DNA (which is keyed on 4 base personas) still applies.
    from services.music_styles import resolve_engine_persona

    return resolve_engine_persona(style_id)


def get_planet_style_voice(planet_name: str, style_id: str) -> PlanetStyleVoice:
    p = normalize_planet(planet_name)
    s = _style_key(style_id)
    key = f"voice|{p}|{s}".encode("utf-8")
    x = zlib.crc32(key) & 0xFFFFFFFF

    def u8(shift: int) -> float:
        return ((x >> shift) & 255) / 255.0

    u0, u1, u2 = u8(0), u8(8), u8(16)

    anchor = _TRANS_ANCHOR.get(p, 0)
    transpose = anchor + int((x % 27) - 13)
    transpose = max(-9, min(11, transpose))

    # Curve: <1 spends more time on low scale degrees, >1 on high (same NASA curve, different contour).
    exp = 0.52 + 1.38 * u0
    exp = max(0.45, min(1.92, exp))

    rotate = int((x >> 10) & 7)
    invert = ((x >> 5) & 1) == 1
    vel = 0.74 + 0.52 * u1
    vel = max(0.68, min(1.32, vel))

    leap_delta = int((x >> 14) & 15) - 7
    leap_delta = max(-6, min(8, leap_delta))

    oct_mul = 0.58 + 0.72 * u2
    oct_mul = max(0.45, min(1.45, oct_mul))

    return PlanetStyleVoice(
        scale_transpose=transpose,
        speed_curve_exp=exp,
        speed_index_rotate=rotate,
        velocity_mul=vel,
        leap_delta=leap_delta,
        invert_speed=invert,
        octave_prob_mul=oct_mul,
    )


def tilt_speed_norm(raw_norm: float, voice: PlanetStyleVoice) -> float:
    t = max(0.0, min(1.0, float(raw_norm)))
    if voice.invert_speed:
        t = 1.0 - t
    e = voice.speed_curve_exp
    if abs(e - 1.0) > 1e-6:
        t = t**e
    return max(0.0, min(1.0, t))
