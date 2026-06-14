"""Structured "why does this sound like this?" explanation.

Generates a JSON-friendly object that the frontend renders as an
**Explainable Sonification** panel. Each entry pairs a physical input
(e.g. orbital speed) with the musical decision derived from it (e.g.
MIDI pitch), with both a short summary and a numeric witness for
classroom use.

The values are *observational* (computed after the events were produced)
rather than declarative — that way the panel stays consistent even if
the harmony engine evolves.
"""

from __future__ import annotations

from statistics import median
from typing import Any, Dict, Iterable, List, Optional

from services.encyclopedia_data import get_planet
from services.music_styles import get_style


def _range(values: Iterable[float]) -> List[float]:
    vs = [float(v) for v in values if v is not None]
    if not vs:
        return [0.0, 0.0]
    return [round(min(vs), 4), round(max(vs), 4)]


def _midi_to_name(note: int) -> str:
    """Return a human-readable note label like 'E4'."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    octave = (note // 12) - 1
    return f"{names[note % 12]}{octave}"


def _key_summary(events: List[Dict[str, Any]]) -> str:
    """Best-effort verbal key descriptor based on harmony rules."""
    if not events:
        return "—"
    bases = [int(e["base_note"]) for e in events]
    intervals = sorted({(n - bases[0]) % 12 for n in bases})
    # Heuristic: presence of minor third (3) without major third (4) → minor.
    if 3 in intervals and 4 not in intervals:
        return "minor"
    if 4 in intervals and 3 not in intervals:
        return "major"
    return "modal / chromatic"


def build_sonification_explanation(
    planet: str,
    style_id: str,
    points: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    days: int,
    seed: int,
    mode: str,
    *,
    lstm_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Produce a UI-ready structured explanation.

    Parameters mirror what ``generate_artifacts`` already has access to,
    so the call site is essentially free.
    """

    style = get_style(style_id)
    facts = get_planet(planet) or {}
    sound_sig = (facts.get("sound_signature") or {}) if facts else {}

    speeds = [float(p.get("speed", 0.0)) for p in points]
    distances = [float(p.get("radius", 0.0)) for p in points]
    intensities = [float(p.get("light_intensity_proxy", 0.0)) for p in points]
    velocities = [int(e.get("velocity", 0)) for e in events]
    bases = [int(e.get("base_note", 60)) for e in events]
    durations = [float(e.get("duration", 0.0)) for e in events]

    rules: List[Dict[str, Any]] = [
        {
            "id": "speed_to_pitch",
            "title": "Orbital speed → pitch",
            "summary": "Higher orbital speed maps to a higher melodic note.",
            "detail": (
                "Each point's normalized speed (0–1) is scaled by the style's "
                "pitch range and added to the planet's base note. Slow points "
                "land low on the keyboard; fast points climb up."
            ),
            "input_label": "speed range (km/s)",
            "input_value": _range(speeds),
            "output_label": "MIDI note range",
            "output_value": [
                _midi_to_name(min(bases)) if bases else "—",
                _midi_to_name(max(bases)) if bases else "—",
            ],
        },
        {
            "id": "intensity_to_velocity",
            "title": "Light intensity → loudness",
            "summary": "Brighter (closer-to-Sun) points play louder.",
            "detail": (
                "A light-intensity proxy 1/r² is normalized and used to scale "
                "MIDI velocity (loudness). Near perihelion the music is more "
                "forceful; near aphelion it relaxes."
            ),
            "input_label": "light intensity (rel.)",
            "input_value": _range(intensities),
            "output_label": "MIDI velocity",
            "output_value": _range(velocities),
        },
        {
            "id": "distance_to_register",
            "title": "Distance → register",
            "summary": "Distance influences which octave the bass and harmony sit in.",
            "detail": (
                "Heliocentric distance shifts the bass and harmony octave so "
                "inner planets feel bright while outer ones feel deep and wide."
            ),
            "input_label": "radius (AU)",
            "input_value": _range(distances),
            "output_label": "median bass note",
            "output_value": (
                _midi_to_name(int(median([int(e.get("bass_note", 36)) for e in events])))
                if events
                else "—"
            ),
        },
        {
            "id": "duration_distribution",
            "title": "Duration distribution",
            "summary": "Note length comes from style rhythm + LSTM modulation when AI mode is on.",
            "detail": (
                "Style determines the baseline rhythmic grid (e.g. calm = "
                "slower notes, pop = busier). AI mode adds learned transitions "
                "that bend durations toward more musical phrasing."
            ),
            "input_label": "duration range (beats)",
            "input_value": _range(durations),
            "output_label": "median duration",
            "output_value": round(median(durations), 3) if durations else 0.0,
        },
    ]

    # Mode-specific commentary so the panel makes sense for both branches.
    if mode == "ai":
        rules.append(
            {
                "id": "ai_transitions",
                "title": "AI transition scoring",
                "summary": "An LSTM model nudges note choices toward learned melodic shapes.",
                "detail": (
                    "After the physics-driven baseline is generated, the AI "
                    "branch consults a sequence model trained on tonal melody "
                    "snippets. The result keeps the same data anchors but "
                    "smooths out unmusical jumps."
                ),
                "input_label": "checkpoint",
                "input_value": (lstm_meta or {}).get("checkpoint") or "configured",
                "output_label": "temperature",
                "output_value": (lstm_meta or {}).get("temperature", 0.92),
            }
        )
    else:
        rules.append(
            {
                "id": "baseline_purity",
                "title": "Baseline — pure physics",
                "summary": "No AI: every note is a direct mapping of orbital state.",
                "detail": (
                    "The baseline branch is fully deterministic for a given "
                    "(planet, seed, days) — useful as a 'before' reference "
                    "when comparing with the AI branch."
                ),
                "input_label": "AI involved?",
                "input_value": "no",
                "output_label": "deterministic?",
                "output_value": "yes",
            }
        )

    return {
        "headline": (
            f"This piece is built from {len(events)} musical events shaped by "
            f"{len(points)} real NASA Horizons samples of {planet} over "
            f"{days} day(s)."
        ),
        "planet_signature": {
            "planet": planet,
            "tonality": sound_sig.get("tonality", _key_summary(events)),
            "rhythm": sound_sig.get("rhythm", style.id),
            "why": sound_sig.get("why")
            or "Orbital dynamics shape the timing and pitch envelope.",
        },
        "style_influence": {
            "style": style.id,
            "bpm": getattr(style, "bpm", None),
            "summary": (
                f"The '{style.id}' style sets the underlying BPM and rhythm "
                "grid that all notes snap to."
            ),
        },
        "data_source": {
            "provider": "NASA JPL Horizons",
            "points_count": len(points),
            "time_window_days": int(days),
            "seed": int(seed),
            "speed_range_km_s": _range(speeds),
            "distance_range_au": _range(distances),
        },
        "rules": rules,
    }
