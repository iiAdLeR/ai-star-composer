"""
GM drum patterns (channel 9) aligned to 4/4 bars. Times are in quarter-note beats.
"""
from __future__ import annotations

from typing import Dict, Iterator, List, Tuple

from services.music_styles import is_birthday_style, resolve_engine_persona
from services.planet_rhythm import get_planet_style_rhythm

Hit = Tuple[float, int, float, int]  # offset_in_bar, pitch, duration_beats, velocity


def _pop_bar() -> List[Hit]:
    hits: List[Hit] = []
    for q in (0, 1, 2, 3):
        hits.append((float(q), 36, 0.1, 95))
    for q in (1, 3):
        hits.append((float(q), 38, 0.07, 76))
    # Lighter hi-hat grid so the mix doesn't wash the melody (was 8× per bar).
    for e in (0.5, 1.5, 2.5, 3.5):
        hits.append((e, 42, 0.04, 34))
    hits.sort(key=lambda h: (h[0], -h[3]))
    return hits


def _celebration_bar() -> List[Hit]:
    """Pop kit + shaker on every 8th — keeps the party feel without crowding the mids."""
    hits: List[Hit] = []
    # Kick on 1 and 3, snare on 2 and 4
    hits.append((0.0, 36, 0.1, 96))
    hits.append((2.0, 36, 0.1, 90))
    hits.append((1.0, 38, 0.08, 84))
    hits.append((3.0, 38, 0.08, 88))
    # Closed hi-hat on the 8ths
    for e in (0.5, 1.5, 2.5, 3.5):
        hits.append((e, 42, 0.04, 36))
    # Shaker (70) on every 8th, alternating velocities
    for i, e in enumerate((0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)):
        hits.append((e, 70, 0.05, 32 if (i % 2 == 0) else 24))
    # Crash on bar 1 (will be on every loop iteration, intentional for excitement)
    hits.append((0.0, 49, 0.5, 56))
    hits.sort(key=lambda h: (h[0], -h[3]))
    return hits


def _tender_bar() -> List[Hit]:
    """Brushed snare on 3 only, very soft kick + sub-pulse — almost lullaby-like."""
    return [
        (0.0, 35, 0.4, 42),   # soft acoustic kick
        (2.0, 38, 0.18, 30),  # gentle brush snare
    ]


def _anthem_bar() -> List[Hit]:
    """Cinematic toms + crashes — the climax of the song deserves real impact."""
    return [
        (0.0, 36, 0.18, 102),  # kick
        (1.0, 47, 0.20, 78),   # mid tom
        (2.0, 38, 0.12, 92),   # snare
        (2.5, 45, 0.16, 70),   # low tom roll
        (3.0, 50, 0.20, 60),   # high tom
        (3.5, 41, 0.14, 62),   # floor tom flam
        (0.0, 57, 0.4, 70),    # crash 2 every bar feels too much; rely on outer crash on phrase
    ]


def _waltz_bar() -> List[Hit]:
    """Brush kit in 3/4 feel — kick on 1, brush on 2 and 3 (mapped across a 4/4 bar)."""
    return [
        (0.0, 35, 0.3, 56),    # soft kick on 1
        (1.0, 39, 0.12, 36),   # hand clap-like brush (actually 39=Hand Clap)
        (2.0, 35, 0.25, 48),
        (3.0, 39, 0.12, 34),
    ]


BAR_PATTERNS: Dict[str, List[Hit]] = {
    "pop": _pop_bar(),
    "calm": [(0.0, 35, 0.22, 46), (2.0, 35, 0.2, 38), (1.0, 51, 0.3, 32), (3.0, 51, 0.25, 28)],
    "study": [(0.0, 37, 0.12, 34), (2.0, 37, 0.1, 28)],
    "cinematic": [
        (0.0, 36, 0.22, 90),
        (1.0, 43, 0.18, 58),
        (2.0, 38, 0.1, 64),
        (3.0, 41, 0.2, 52),
    ],
    # Birthday-specific patterns (looked up before persona fallback).
    "celebration": _celebration_bar(),
    "tender": _tender_bar(),
    "anthem": _anthem_bar(),
    "waltz": _waltz_bar(),
    # `nebula` is intentionally absent — sonifier.py suppresses drums for it.
}


def iter_drum_midi_events(
    style_id: str,
    end_beat: float,
    planet_name: str = "Earth",
) -> Iterator[Tuple[float, int, float, int]]:
    """Yield (start_beat, pitch, duration_beats, velocity) until past end_beat.

    Birthday styles have dedicated drum patterns; if a birthday id is not
    found we fall back to its engine persona, so the table never crashes
    on a new style id.
    """
    sid = (style_id or "").strip().lower()
    if sid in BAR_PATTERNS:
        pattern = BAR_PATTERNS[sid]
        persona_for_rhythm = resolve_engine_persona(sid) if is_birthday_style(sid) else sid
    else:
        persona_for_rhythm = resolve_engine_persona(sid)
        pattern = BAR_PATTERNS.get(persona_for_rhythm, BAR_PATTERNS["calm"])
    pr = get_planet_style_rhythm(planet_name, persona_for_rhythm)
    bar_len = 4.0
    limit = max(end_beat + bar_len * 2.0, bar_len * 4.0)
    b = 0
    while True:
        base = b * bar_len
        if base >= limit:
            break
        for off, pitch, dur, vel in pattern:
            shifted = (float(off) + pr.drum_phase_beats) % bar_len
            t = base + shifted
            v = min(127, max(1, int(round(vel * pr.drum_velocity_scale))))
            if t < limit:
                yield (t, pitch, dur, v)
        b += 1
