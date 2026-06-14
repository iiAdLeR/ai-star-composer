"""
Preset musical styles for sonification.

Two families of styles live here:

* **Studio styles** (`calm`, `pop`, `study`, `cinematic`) — the original
  data-sonification presets, tuned to be musically useful across very
  different inputs (slow Neptune ↔ fast Mercury). They drive `/generate`,
  `/compare`, `/live`, and the Orbital Lab.
* **Birthday gift styles** (`celebration`, `tender`, `anthem`, `waltz`,
  `nebula`) — five dedicated presets *only* exposed by `/birthday`. They
  each have a distinct musical persona (scale, BPM, dynamics, harmony
  density) and their own General-MIDI instrument trio so the resulting
  song feels like a hand-authored dedication and not a renamed Studio
  preset.

Each style declares an `engine_persona`. The harmony scoring, drum
patterns, and per-planet rhythm jitter all branch on a small fixed set
of persona keys (`calm | pop | study | cinematic`). Birthday styles
inherit one of those personas so the engine keeps doing something
sensible even though the public id (e.g. `celebration`) is new — while
their scale, BPM, lead intervals and per-track instruments give them
their own identity.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# Public-facing ID for the API. Studio + birthday families share the same
# string type to keep the API surface uniform; consumers that need to
# restrict to one family should use `is_birthday_style()`.
StyleId = str

# Personas the lower-level engines understand. Anything else (e.g. a new
# birthday style) MUST declare `engine_persona` pointing at one of these.
ENGINE_PERSONAS: Tuple[str, ...] = ("calm", "pop", "study", "cinematic")


@dataclass(frozen=True)
class MusicStyle:
    id: str
    label_en: str
    label_ar: str
    scale: Tuple[int, ...]
    bpm: int
    """Base spacing between events (MIDI time units ~= beats if duration similar)."""
    step_base: float
    velocity_floor: int
    velocity_light_range: int
    duration_min: float
    duration_max: float
    """Random multiplicative wobble on step timing (0..1)."""
    rhythm_wobble: float
    third_semitones: int
    repeat_memory: int
    """How many recent melody notes penalize repetition in AI scoring."""
    harmony_density: float
    """1.0 = always full chord; lower = often drop to fifth-only or sparse."""
    seventh_radius_threshold: float
    """If radius_norm above this, add minor 7th on top."""
    lead_options: Tuple[int, ...]
    """Semitone offsets from base for the secondary voice (variety)."""
    quantize_grid: float = 0.25
    """Snap event start times to this grid (beats) for clearer rhythm."""
    wobble_step_scale: float = 1.0
    """Multiplier on rhythm_wobble for spacing between notes (lower = steadier pulse)."""
    wobble_duration_scale: float = 1.0
    """Multiplier on rhythm_wobble for note lengths (lower = cleaner note tails)."""
    duration_snap_grid: float = 0.0
    """If >0, snap durations to this grid (beats); 0 means use quantize_grid."""
    quantize_min_gap: float = 0.0
    """Min spacing after quantize (beats); 0 = auto from quantize_grid."""
    strict_pulse_grid: float = 0.0
    """If >0, force monotonic onsets on this grid (beats) for a steadier pulse."""
    melodic_max_leap: int = 0
    """In AI mode: max |Δsemitones| from previous melody note (0 = no cap). Smaller = smoother line."""
    octave_shift_probability: float = 0.12
    """Chance to nudge melody by ±1 octave (snapped to scale); lower = more coherent stream."""
    # ---- Engine routing -----------------------------------------------------
    engine_persona: str = ""
    """Which of ENGINE_PERSONAS the lower-level engines should treat this
    style as. Empty string means "use my own id", which only works for the
    four base styles. Birthday styles MUST set this."""
    # ---- General-MIDI instrumentation --------------------------------------
    # Defaults match the original sonifier choice (piano / electric-bass /
    # string ensemble) so legacy styles are byte-identical.
    program_lead: int = 0  # GM 0 = Acoustic Grand Piano
    program_bass: int = 33  # GM 33 = Electric Bass (finger)
    program_harmony: int = 49  # GM 49 = String Ensemble 2
    # ---- Presentation metadata (UI only — not used by the engine) ----------
    is_birthday: bool = False
    description_en: str = ""
    description_tr: str = ""
    label_tr: str = ""


# ---------------------------------------------------------------------------
# Studio styles (data-sonification presets)
# ---------------------------------------------------------------------------
_STUDIO_STYLES: Dict[str, MusicStyle] = {
    "calm": MusicStyle(
        id="calm",
        label_en="Calm / ambient",
        label_ar="هادئة / أجواء",
        scale=(60, 63, 65, 67, 70),
        bpm=72,
        step_base=0.95,
        velocity_floor=36,
        velocity_light_range=32,
        duration_min=1.15,
        duration_max=2.9,
        rhythm_wobble=0.12,
        third_semitones=3,
        repeat_memory=5,
        harmony_density=0.88,
        seventh_radius_threshold=0.72,
        lead_options=(-2, 2, 3, 5, -3),
        quantize_grid=0.25,
        wobble_step_scale=0.85,
        wobble_duration_scale=0.55,
        duration_snap_grid=0.25,
        melodic_max_leap=8,
        octave_shift_probability=0.07,
    ),
    "pop": MusicStyle(
        id="pop",
        label_en="Pop / bright",
        label_ar="بوب / إيقاع خفيف",
        scale=(60, 62, 64, 67, 69),
        bpm=118,
        step_base=0.5,
        velocity_floor=52,
        velocity_light_range=48,
        duration_min=0.25,
        duration_max=0.55,
        rhythm_wobble=0.12,
        third_semitones=4,
        repeat_memory=4,
        harmony_density=0.9,
        seventh_radius_threshold=0.85,
        lead_options=(2, 4, 7, -2, 5),
        quantize_grid=0.125,
        wobble_step_scale=0.45,
        wobble_duration_scale=0.35,
        duration_snap_grid=0.125,
        quantize_min_gap=0.125,
        strict_pulse_grid=0.125,
        melodic_max_leap=11,
        octave_shift_probability=0.13,
    ),
    "study": MusicStyle(
        id="study",
        label_en="Deep focus / study",
        label_ar="دراسة / تركيز عميق",
        scale=(60, 62, 63, 65, 67, 69, 70),
        bpm=60,
        step_base=1.0,
        velocity_floor=32,
        velocity_light_range=28,
        duration_min=2.0,
        duration_max=4.0,
        rhythm_wobble=0.1,
        third_semitones=3,
        repeat_memory=6,
        harmony_density=0.58,
        seventh_radius_threshold=0.88,
        lead_options=(-2, 2, 3, 4, 5),
        quantize_grid=0.5,
        wobble_step_scale=0.75,
        wobble_duration_scale=0.4,
        duration_snap_grid=0.5,
        quantize_min_gap=0.25,
        melodic_max_leap=5,
        octave_shift_probability=0.04,
    ),
    "cinematic": MusicStyle(
        id="cinematic",
        label_en="Cinematic / epic",
        label_ar="سينمائي / إيقاع درامي",
        scale=(60, 62, 63, 65, 67, 68, 70, 72),
        bpm=88,
        step_base=0.75,
        velocity_floor=44,
        velocity_light_range=52,
        duration_min=0.75,
        duration_max=1.75,
        rhythm_wobble=0.2,
        third_semitones=3,
        repeat_memory=5,
        harmony_density=0.92,
        seventh_radius_threshold=0.55,
        lead_options=(-2, 3, 5, 7, -3, 4),
        quantize_grid=0.25,
        wobble_step_scale=0.65,
        wobble_duration_scale=0.5,
        duration_snap_grid=0.25,
        quantize_min_gap=0.25,
        strict_pulse_grid=0.25,
        melodic_max_leap=7,
        octave_shift_probability=0.09,
    ),
}


# ---------------------------------------------------------------------------
# Birthday gift styles (only valid for /birthday)
# ---------------------------------------------------------------------------
# Design notes per style:
#
# * `celebration`: bright C-major-hexatonic with high C "uplift", strong
#   pop-driven backbeat, music-box lead → festive but not childish.
# * `tender`: F-major maj7-friendly, slow, with warm pad — works for
#   intimate / romantic dedications.
# * `anthem`: D-major lydian (#4 brings the "wonder" feel) + horns/cello/
#   strings, mid-tempo cinematic processional. The life-montage style.
# * `waltz`: G-major over a brisk 132 BPM, harpsichord + pizzicato →
#   elegant ballroom flavor (we stay in 4/4 to keep the sonifier simple).
# * `nebula`: D / G / A sus-style spread spanning ~2 octaves, glockenspiel +
#   bowed pad, very slow drone-like motion → "your planet has been singing
#   since forever" sound.
_BIRTHDAY_STYLES: Dict[str, MusicStyle] = {
    "celebration": MusicStyle(
        id="celebration",
        label_en="Celebration",
        label_ar="احتفال",
        label_tr="Kutlama",
        scale=(60, 62, 64, 67, 69, 72),  # C major hexatonic + high C
        bpm=110,
        step_base=0.5,
        velocity_floor=58,
        velocity_light_range=50,
        duration_min=0.28,
        duration_max=0.6,
        rhythm_wobble=0.10,
        third_semitones=4,
        repeat_memory=4,
        harmony_density=0.95,
        seventh_radius_threshold=0.82,
        lead_options=(4, 7, 9, 12, -3, 5),
        quantize_grid=0.125,
        wobble_step_scale=0.45,
        wobble_duration_scale=0.35,
        duration_snap_grid=0.125,
        quantize_min_gap=0.125,
        strict_pulse_grid=0.125,
        melodic_max_leap=12,
        octave_shift_probability=0.15,
        engine_persona="pop",
        # GM 10 = Music Box · 32 = Acoustic Bass · 48 = String Ensemble 1
        program_lead=10,
        program_bass=32,
        program_harmony=48,
        is_birthday=True,
        description_en="Bright, festive, danceable. Major hexatonic with high-C uplifts and a steady backbeat — the default party feel.",
        description_tr="Parlak, neşeli, hareketli. Yüksek C ile yükselen majör hekzatonik ve sabit bir backbeat — varsayılan parti hissi.",
    ),
    "tender": MusicStyle(
        id="tender",
        label_en="Tender dedication",
        label_ar="إهداء حنون",
        label_tr="İçten ithaf",
        scale=(65, 67, 69, 72, 74, 77, 81),  # F major spanning ~2 octaves
        bpm=64,
        step_base=1.1,
        velocity_floor=32,
        velocity_light_range=28,
        duration_min=1.8,
        duration_max=3.6,
        rhythm_wobble=0.08,
        third_semitones=4,
        repeat_memory=6,
        harmony_density=0.78,
        seventh_radius_threshold=0.50,  # lots of maj7
        lead_options=(-2, 4, 7, -4, 11, 9),
        quantize_grid=0.25,
        wobble_step_scale=0.7,
        wobble_duration_scale=0.5,
        duration_snap_grid=0.5,
        melodic_max_leap=7,
        octave_shift_probability=0.06,
        engine_persona="calm",
        # GM 0 = Piano · 32 = Acoustic Bass · 89 = Pad 2 (Warm)
        program_lead=0,
        program_bass=32,
        program_harmony=89,
        is_birthday=True,
        description_en="Slow, intimate, warm. Major-7 piano over a warm pad — for close family, partners, or anyone who deserves a hug in audio form.",
        description_tr="Yavaş, samimi, sıcak. Sıcak bir pad üzerinde majör-7 piyano — yakın aile, sevgili veya sesli bir sarılmayı hak eden herkes için.",
    ),
    "anthem": MusicStyle(
        id="anthem",
        label_en="Cosmic anthem",
        label_ar="نشيد كوني",
        label_tr="Kozmik marş",
        # D Major lydian — D E F# G# A B (octave) D
        scale=(62, 64, 66, 68, 69, 71, 74),
        bpm=92,
        step_base=0.75,
        velocity_floor=52,
        velocity_light_range=58,
        duration_min=0.95,
        duration_max=2.1,
        rhythm_wobble=0.16,
        third_semitones=4,
        repeat_memory=5,
        harmony_density=0.96,
        seventh_radius_threshold=0.60,
        lead_options=(4, 7, 9, 12, -5, 11),
        quantize_grid=0.25,
        wobble_step_scale=0.65,
        wobble_duration_scale=0.5,
        duration_snap_grid=0.25,
        quantize_min_gap=0.25,
        strict_pulse_grid=0.25,
        melodic_max_leap=9,
        octave_shift_probability=0.11,
        engine_persona="cinematic",
        # GM 60 = French Horn · 42 = Cello · 49 = String Ensemble 2
        program_lead=60,
        program_bass=42,
        program_harmony=49,
        is_birthday=True,
        description_en="Heroic, soaring, life-montage. Lydian #4 over horns, cello, and strings — for milestone birthdays.",
        description_tr="Kahramanca, yükselen, hayat montajı. Korno, çello ve yaylılar üzerinde lidya #4 — kilometre taşı doğum günleri için.",
    ),
    "waltz": MusicStyle(
        id="waltz",
        label_en="Starlit waltz",
        label_ar="فالس النجوم",
        label_tr="Yıldızlı vals",
        scale=(67, 69, 71, 72, 74, 76, 78, 79),  # G major
        bpm=132,
        step_base=0.4,
        velocity_floor=46,
        velocity_light_range=42,
        duration_min=0.45,
        duration_max=0.95,
        rhythm_wobble=0.12,
        third_semitones=4,
        repeat_memory=5,
        harmony_density=0.86,
        seventh_radius_threshold=0.78,
        lead_options=(2, 4, 7, -2, 11, 12),
        quantize_grid=0.25,
        wobble_step_scale=0.55,
        wobble_duration_scale=0.45,
        duration_snap_grid=0.25,
        quantize_min_gap=0.25,
        strict_pulse_grid=0.25,
        melodic_max_leap=7,
        octave_shift_probability=0.08,
        engine_persona="cinematic",
        # GM 6 = Harpsichord · 45 = Pizzicato Strings · 48 = String Ensemble 1
        program_lead=6,
        program_bass=45,
        program_harmony=48,
        is_birthday=True,
        description_en="Elegant, ballroom-flavored. Harpsichord and pizzicato over G major — feels like a classical dedication.",
        description_tr="Zarif, balo salonu aromalı. G majör üzerinde klavsen ve pizzicato — klasik bir ithaf gibi hissettirir.",
    ),
    "nebula": MusicStyle(
        id="nebula",
        label_en="Nebula drift",
        label_ar="انجراف السديم",
        label_tr="Bulutsu sürüklenmesi",
        # Wide D/G/A sus-style spread across two octaves
        scale=(62, 67, 69, 74, 76, 81, 86),
        bpm=56,
        step_base=1.4,
        velocity_floor=30,
        velocity_light_range=26,
        duration_min=2.4,
        duration_max=4.8,
        rhythm_wobble=0.20,
        third_semitones=5,  # sus4 feel
        repeat_memory=6,
        harmony_density=0.62,
        seventh_radius_threshold=0.72,
        lead_options=(5, 7, 12, -5, 14, 9),
        quantize_grid=0.5,
        wobble_step_scale=0.95,
        wobble_duration_scale=0.6,
        duration_snap_grid=0.5,
        melodic_max_leap=9,
        octave_shift_probability=0.18,
        engine_persona="calm",
        # GM 9 = Glockenspiel · 92 = Pad 5 (Bowed) · 89 = Pad 2 (Warm)
        program_lead=9,
        program_bass=92,
        program_harmony=89,
        is_birthday=True,
        description_en="Ethereal, ambient, cosmic. Glockenspiel over bowed pads, open fifth-stacked voicings — for the 'your planet has been singing since forever' feel.",
        description_tr="Eteryal, ambiyans, kozmik. Yaylı pad'ler üzerinde glockenspiel, açık beşli yığınları — 'gezegeni hep söylüyor' hissi için.",
    ),
}


# ---------------------------------------------------------------------------
# Planet-drone style — "what does this world actually sound like?"
# ---------------------------------------------------------------------------
# Inspired by the Voyager/Cassini PWS recordings of planetary magnetospheres
# (Jupiter's deep growl, Saturn's metallic whistles, Earth's "chorus"
# emissions...).  We don't replay those recordings — instead we shape the
# Studio sonification to behave like one: extremely slow tempo, very long
# sustained notes, sparse harmony, and three stacked pad voices (a high
# halo, a low sweep, a choir filling the mid).  Each planet still imprints
# its own transposition + voice DNA via `planet_voice`, so the same drone
# style sounds materially different on Jupiter vs Mercury.
_DRONE_STYLES: Dict[str, MusicStyle] = {
    "drone": MusicStyle(
        id="drone",
        label_en="Planet drone · realistic",
        label_ar="درون كوكبي / صوت فضاء",
        label_tr="Gezegen dronu · gerçekçi",
        # Wide open spread spanning ~2.5 octaves — gives the per-planet
        # transpose room to find a unique register without clipping.
        scale=(48, 55, 60, 62, 67, 72, 74, 79, 84),
        bpm=40,
        step_base=3.5,
        velocity_floor=28,
        velocity_light_range=20,
        duration_min=4.0,
        duration_max=9.0,
        rhythm_wobble=0.22,
        third_semitones=7,           # open fifth = drone-friendly
        repeat_memory=8,
        harmony_density=0.45,        # sparse — let the drone breathe
        seventh_radius_threshold=0.65,
        lead_options=(7, 12, -5, 14, 5, -7),
        quantize_grid=0.5,
        wobble_step_scale=0.95,
        wobble_duration_scale=0.6,
        duration_snap_grid=0.5,
        melodic_max_leap=12,
        octave_shift_probability=0.18,
        engine_persona="calm",
        # GM 94 = Pad 7 (Halo) · 95 = Pad 8 (Sweep) · 91 = Pad 4 (Choir)
        program_lead=94,
        program_bass=95,
        program_harmony=91,
        is_birthday=False,
        description_en=(
            "Cinematic, ambient, planet-as-instrument. Slow halo pads over a sweep bass "
            "and a choir mid — each planet drifts into its own register so Jupiter rumbles "
            "and Mercury shimmers."
        ),
        description_tr=(
            "Sinematik, ambiyans, gezegen bir enstrüman gibi. Sweep bas üzerinde yavaş halo "
            "pad'leri ve koro orta katmanı — her gezegen kendi rejistrine kayar, böylece Jüpiter "
            "uğuldar, Merkür parıldar."
        ),
    ),
}


# Combined registry. Studio first → birthday → drone so existing LSTM
# checkpoints (trained with num_styles=4 or 9) keep their index mapping
# intact: drone is at position 9 and falls back to the `calm` persona for
# the LSTM head via `style_name_to_idx`.
STYLES: Dict[str, MusicStyle] = {**_STUDIO_STYLES, **_BIRTHDAY_STYLES, **_DRONE_STYLES}

# Canonical ordered IDs (kept stable for the UI even if `STYLES` is mutated).
# Drone is exposed alongside the 4 original studio styles in the Studio page.
STUDIO_STYLE_IDS: Tuple[str, ...] = tuple(_STUDIO_STYLES.keys()) + tuple(_DRONE_STYLES.keys())
BIRTHDAY_STYLE_IDS: Tuple[str, ...] = tuple(_BIRTHDAY_STYLES.keys())
DRONE_STYLE_IDS: Tuple[str, ...] = tuple(_DRONE_STYLES.keys())

# Styles whose drum bed is intentionally suppressed (consumers should
# treat any id in this set as "no percussion track in any output").
_NO_DRUM_STYLES: frozenset[str] = frozenset({"nebula", "drone"})


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
def get_style(style_id: str) -> MusicStyle:
    key = (style_id or "calm").strip().lower()
    if key not in STYLES:
        return STYLES["calm"]
    return STYLES[key]


def resolve_engine_persona(style_id: str) -> str:
    """Return the persona key (`calm|pop|study|cinematic`) for any style.

    For studio styles this is the style id itself. For birthday styles it
    is the explicitly declared `engine_persona`. Unknown ids degrade to
    `"calm"` rather than raising, matching the historical default.
    """
    style = get_style(style_id)
    persona = (style.engine_persona or style.id).strip().lower()
    if persona not in ENGINE_PERSONAS:
        return "calm"
    return persona


def is_birthday_style(style_id: Optional[str]) -> bool:
    if not style_id:
        return False
    s = STYLES.get(style_id.strip().lower())
    return bool(s and s.is_birthday)


def style_has_drums(style_id: Optional[str]) -> bool:
    """Universal drum-suppression check.

    Some styles are intentionally ambient/drone (e.g. `nebula`, `drone`)
    and any percussion would break their atmosphere.  The MIDI writer +
    WAV synth fallback consult this so a single source of truth governs
    every renderer.
    """
    if not style_id:
        return True
    return (style_id or "").strip().lower() not in _NO_DRUM_STYLES


def list_styles() -> List[Dict[str, str]]:
    """Studio-facing style list (now includes the `drone` ambient preset)."""
    return [
        {"id": s.id, "label_en": s.label_en, "label_ar": s.label_ar}
        for s in {**_STUDIO_STYLES, **_DRONE_STYLES}.values()
    ]


def list_birthday_styles() -> List[Dict[str, str]]:
    """Rich birthday-style descriptors for the /birthday picker."""
    return [
        {
            "id": s.id,
            "label_en": s.label_en,
            "label_ar": s.label_ar,
            "label_tr": s.label_tr,
            "description_en": s.description_en,
            "description_tr": s.description_tr,
            "bpm": s.bpm,
            "persona": s.engine_persona,
        }
        for s in _BIRTHDAY_STYLES.values()
    ]


def build_markov_for_scale(scale: Tuple[int, ...]) -> Dict[int, List[int]]:
    """Stepwise-friendly transitions on a fixed scale."""
    out: Dict[int, List[int]] = {}
    n = len(scale)
    for i, note in enumerate(scale):
        neigh: List[int] = []
        for d in (-2, -1, 0, 1, 2, 3):
            neigh.append(scale[(i + d) % n])
        out[note] = list(dict.fromkeys(neigh))
    return out
