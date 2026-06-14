"""Synthetic celebration-MIDI dataset generator.

Each of the 5 birthday styles (`celebration`, `tender`, `anthem`,
`waltz`, `nebula`) has its own chord-progression bank, rhythmic
profile, and melodic contour rules.  We expand those into many
randomized but musically valid `notes: [{pitch, duration}]` rows so
the LSTM has actual celebration-style training material instead of
inheriting the Studio's data-sonification statistics.

Each row carries (style_idx, planet_idx) so the existing
`train_sequence_lstm.py` script can train a fully style+planet
conditioned model that knows about all 9 styles (4 studio + 5
birthday) end-to-end.

The script is deterministic given `--seed` so the dataset is
reproducible across machines / re-runs.

Usage:
    python -m scripts.generate_birthday_dataset \
        --out data/ml/birthday_sequences.jsonl \
        --rows-per-style 100 \
        --notes-per-row 96
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

# Style id order MUST match `BIRTHDAY_STYLE_IDS` in services.music_styles
# (`celebration`, `tender`, `anthem`, `waltz`, `nebula`).  We hardcode
# the index offset here (4) so this script does not import the FastAPI
# server (it must stay runnable in a vanilla `python -m` shell).
STUDIO_STYLE_COUNT = 4
BIRTHDAY_STYLE_ORDER: Tuple[str, ...] = (
    "celebration",
    "tender",
    "anthem",
    "waltz",
    "nebula",
)
NUM_PLANETS = 8


# Chord = (root semitone, intervals from root in semitones)
# We use the "1=C4=60" convention; transpose by style tonic at render
# time.  Common bank:
MAJ = (0, 4, 7)
MIN = (0, 3, 7)
MAJ7 = (0, 4, 7, 11)
MIN7 = (0, 3, 7, 10)
DOM7 = (0, 4, 7, 10)
SUS4 = (0, 5, 7)
SUS2 = (0, 2, 7)
ADD9 = (0, 4, 7, 14)
M7B5 = (0, 3, 6, 10)


@dataclass(frozen=True)
class Chord:
    root_offset: int  # semitones above tonic
    intervals: Tuple[int, ...]


# Progressions (in scale degrees, but stored as semitone roots above the tonic)
# Common pop / wedding / cinematic moves:
I = lambda intervals=MAJ: Chord(0, intervals)
ii = lambda intervals=MIN: Chord(2, intervals)
iii = lambda intervals=MIN: Chord(4, intervals)
IV = lambda intervals=MAJ: Chord(5, intervals)
V = lambda intervals=MAJ: Chord(7, intervals)
vi = lambda intervals=MIN: Chord(9, intervals)
vii = lambda intervals=M7B5: Chord(11, intervals)


@dataclass(frozen=True)
class StyleSpec:
    style_idx: int
    tonic: int                  # MIDI pitch of the tonic in the chosen register
    scale_semitones: Tuple[int, ...]  # semitones above tonic (one octave)
    progressions: Tuple[Tuple[Chord, ...], ...]
    note_count_per_chord: Tuple[int, int]  # min, max notes within a chord
    duration_choices: Tuple[float, ...]
    syncopation: float          # 0..1 — probability of off-grid hit
    octave_jump_chance: float
    melodic_leap_max: int       # max semitone jump
    pad_motion: str             # "stepwise" | "arpeggio" | "ambient"
    register_low: int
    register_high: int


# Scales (one octave, in semitones above tonic)
MAJOR = (0, 2, 4, 5, 7, 9, 11)
LYDIAN = (0, 2, 4, 6, 7, 9, 11)
DORIAN = (0, 2, 3, 5, 7, 9, 10)
MIXOLYDIAN = (0, 2, 4, 5, 7, 9, 10)
PENTATONIC_MAJ = (0, 2, 4, 7, 9)
SUS_OPEN = (0, 5, 7, 12, 17, 19, 24)  # ambient nebula scale


_STYLES: Dict[str, StyleSpec] = {
    # CELEBRATION — bright C major, 110 BPM feel, party progressions
    "celebration": StyleSpec(
        style_idx=STUDIO_STYLE_COUNT + 0,
        tonic=60,  # C4
        scale_semitones=MAJOR,
        progressions=(
            (I(), V(), vi(), IV()),               # I-V-vi-IV (axis of awesome)
            (I(), IV(), V(), I()),                # I-IV-V-I (classic)
            (vi(), IV(), I(), V()),               # pop punk
            (I(ADD9), vi(MIN7), IV(MAJ7), V(DOM7)),  # extended pop
        ),
        note_count_per_chord=(5, 9),
        duration_choices=(0.25, 0.25, 0.5, 0.5, 0.75, 1.0),
        syncopation=0.18,
        octave_jump_chance=0.12,
        melodic_leap_max=12,
        pad_motion="stepwise",
        register_low=55,
        register_high=84,
    ),
    # TENDER — slow F major, lyrical, lots of maj7
    "tender": StyleSpec(
        style_idx=STUDIO_STYLE_COUNT + 1,
        tonic=65,  # F4
        scale_semitones=MAJOR,
        progressions=(
            (I(MAJ7), vi(MIN7), IV(MAJ7), V(DOM7)),
            (I(MAJ7), iii(MIN7), IV(MAJ7), I(MAJ7)),
            (vi(MIN7), IV(MAJ7), I(MAJ7), V(DOM7)),
            (I(MAJ7), V(DOM7), vi(MIN7), iii(MIN7)),
        ),
        note_count_per_chord=(3, 6),
        duration_choices=(1.0, 1.5, 1.5, 2.0, 2.0, 3.0),
        syncopation=0.05,
        octave_jump_chance=0.05,
        melodic_leap_max=7,
        pad_motion="stepwise",
        register_low=60,
        register_high=84,
    ),
    # ANTHEM — D lydian, soaring, big leaps
    "anthem": StyleSpec(
        style_idx=STUDIO_STYLE_COUNT + 2,
        tonic=62,  # D4
        scale_semitones=LYDIAN,
        progressions=(
            (I(), V(), IV(), I()),
            (I(), vi(MIN7), IV(MAJ7), V(DOM7)),
            (I(MAJ7), V(DOM7), vi(MIN7), I(MAJ7)),
            (I(), IV(), V(), I()),
        ),
        note_count_per_chord=(4, 8),
        duration_choices=(0.5, 0.75, 0.75, 1.0, 1.0, 1.5),
        syncopation=0.15,
        octave_jump_chance=0.14,
        melodic_leap_max=12,
        pad_motion="arpeggio",
        register_low=55,
        register_high=86,
    ),
    # WALTZ — G major in 3/4 feel
    "waltz": StyleSpec(
        style_idx=STUDIO_STYLE_COUNT + 3,
        tonic=67,  # G4
        scale_semitones=MAJOR,
        progressions=(
            (I(), V(), I(), V()),
            (I(), IV(), V(), I()),
            (vi(), ii(MIN7), V(DOM7), I()),
            (I(MAJ7), vi(MIN7), ii(MIN7), V(DOM7)),
        ),
        note_count_per_chord=(3, 6),    # 3 beats per measure feel
        duration_choices=(0.5, 0.5, 0.5, 1.0, 1.5),
        syncopation=0.08,
        octave_jump_chance=0.08,
        melodic_leap_max=9,
        pad_motion="arpeggio",
        register_low=60,
        register_high=86,
    ),
    # NEBULA — sus + ambient drift
    "nebula": StyleSpec(
        style_idx=STUDIO_STYLE_COUNT + 4,
        tonic=62,  # D4
        scale_semitones=MAJOR,           # we'll restrict to sus tones via chords
        progressions=(
            (I(SUS4), IV(SUS2), V(SUS4), I(SUS4)),
            (I(SUS2), IV(SUS4), I(SUS2), V(SUS2)),
            (I(SUS4), V(SUS2), IV(SUS4), I(SUS4)),
            (I(ADD9), IV(MAJ7), V(SUS4), I(SUS4)),
        ),
        note_count_per_chord=(2, 4),
        duration_choices=(2.0, 2.5, 3.0, 3.0, 4.0),
        syncopation=0.02,
        octave_jump_chance=0.18,         # frequent register jumps for drift
        melodic_leap_max=14,
        pad_motion="ambient",
        register_low=55,
        register_high=92,
    ),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _scale_pitches(tonic: int, scale: Sequence[int], lo: int, hi: int) -> List[int]:
    """All MIDI pitches inside [lo, hi] that lie in the scale."""
    out: List[int] = []
    base = (tonic - lo) // 12 + 1
    for o in range(-3, 4):
        for s in scale:
            n = tonic + 12 * o + s
            if lo <= n <= hi:
                out.append(n)
    return sorted(set(out))


def _chord_pitches(tonic: int, chord: Chord, lo: int, hi: int) -> List[int]:
    out: List[int] = []
    root = tonic + chord.root_offset
    for o in range(-2, 3):
        for iv in chord.intervals:
            n = root + 12 * o + iv
            if lo <= n <= hi:
                out.append(n)
    return sorted(set(out))


def _snap_to_scale(pitch: int, scale_pitches: Sequence[int]) -> int:
    if not scale_pitches:
        return pitch
    best = scale_pitches[0]
    for p in scale_pitches:
        if abs(p - pitch) < abs(best - pitch):
            best = p
    return best


def _melodic_step(
    prev: int,
    target_chord: List[int],
    scale_pitches: List[int],
    *,
    leap_max: int,
    jump_chance: float,
    rng: random.Random,
) -> int:
    """One musically reasonable next pitch.

    Heuristic:
      - 70% time: stepwise motion within scale toward nearest chord tone
      - 20% time: leap to a chord tone within `leap_max`
      - 10% time: octave jump (if `jump_chance` allows)
    """
    roll = rng.random()
    if roll < jump_chance:
        # Octave displacement
        direction = rng.choice((-12, 12))
        cand = prev + direction
        return _snap_to_scale(cand, scale_pitches)
    if roll < jump_chance + 0.55:
        # Stepwise — move 1 or 2 scale degrees toward nearest chord tone
        target = min(target_chord, key=lambda p: abs(p - prev)) if target_chord else prev
        if abs(target - prev) <= 2:
            return target
        step = 1 if target > prev else -1
        scale_idx = scale_pitches.index(_snap_to_scale(prev, scale_pitches))
        new_idx = max(0, min(len(scale_pitches) - 1, scale_idx + step))
        return scale_pitches[new_idx]
    # Leap to a chord tone
    candidates = [p for p in target_chord if abs(p - prev) <= leap_max]
    if not candidates:
        candidates = target_chord
    return rng.choice(candidates) if candidates else prev


def _generate_sequence(
    style: StyleSpec,
    *,
    n_notes: int,
    seed: int,
) -> List[Tuple[int, float]]:
    """Build a (pitch, duration) sequence following the style's rules."""
    rng = random.Random(seed)
    scale_pitches = _scale_pitches(
        style.tonic, style.scale_semitones, style.register_low, style.register_high
    )
    if not scale_pitches:
        return []
    notes: List[Tuple[int, float]] = []
    prev = style.tonic
    # Pick a progression and cycle through it until n_notes is reached.
    progression = rng.choice(style.progressions)

    chord_idx = 0
    while len(notes) < n_notes:
        chord = progression[chord_idx % len(progression)]
        chord_idx += 1
        chord_pitches = _chord_pitches(
            style.tonic, chord, style.register_low, style.register_high
        )
        if not chord_pitches:
            chord_pitches = scale_pitches[:4]
        # Decide how many notes to put on this chord.
        lo, hi = style.note_count_per_chord
        k = rng.randint(lo, hi)
        # First note of a phrase often lands on the chord root for clarity.
        if rng.random() < 0.55 and chord_pitches:
            prev = chord_pitches[0]
            d = rng.choice(style.duration_choices)
            notes.append((prev, d))
            k -= 1
        for _ in range(k):
            if len(notes) >= n_notes:
                break
            nxt = _melodic_step(
                prev,
                chord_pitches,
                scale_pitches,
                leap_max=style.melodic_leap_max,
                jump_chance=style.octave_jump_chance,
                rng=rng,
            )
            d = rng.choice(style.duration_choices)
            if rng.random() < style.syncopation:
                d = max(0.125, d * rng.choice((0.5, 0.75, 1.25)))
            notes.append((nxt, round(d, 3)))
            prev = nxt
    return notes[:n_notes]


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/ml/birthday_sequences.jsonl")
    ap.add_argument("--rows-per-style", type=int, default=100)
    ap.add_argument("--notes-per-row", type=int, default=96)
    ap.add_argument("--seed", type=int, default=20260614)
    args = ap.parse_args()

    rng_master = random.Random(args.seed)
    out_dir = os.path.dirname(args.out) or "."
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    with open(args.out, "w", encoding="utf-8") as fp:
        for style_name in BIRTHDAY_STYLE_ORDER:
            style = _STYLES[style_name]
            for r in range(args.rows_per_style):
                # Distribute synthetic rows across the 8 planets so the planet
                # embedding still has signal for birthday styles.
                planet_idx = (r + style.style_idx * 7) % NUM_PLANETS
                seed = rng_master.randint(0, 2**31 - 1)
                seq = _generate_sequence(style, n_notes=args.notes_per_row, seed=seed)
                if not seq:
                    continue
                row = {
                    "style_idx": style.style_idx,
                    "planet_idx": planet_idx,
                    "style": style_name,
                    "notes": [{"pitch": int(p), "duration": float(d)} for p, d in seq],
                }
                fp.write(json.dumps(row, ensure_ascii=False))
                fp.write("\n")
                total += 1
    print(
        f"Wrote {total} rows -> {args.out}  "
        f"(styles={len(BIRTHDAY_STYLE_ORDER)}, rows_per_style={args.rows_per_style}, "
        f"notes_per_row={args.notes_per_row}, seed={args.seed})"
    )


if __name__ == "__main__":
    main()
