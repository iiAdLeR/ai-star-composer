"""Birthday Gift service — turn a birth date into a personalized planet song.

The flow is intentionally a thin orchestration on top of the existing
`generation_service` pipeline so we inherit MIDI/WAV/HQ rendering, LSTM
blending, and FluidSynth support for free:

1. Validate the (planet, birth_date, recipient_name) tuple.
2. Pull a *sampled* NASA Horizons window covering [birth_date, today].
   Wide ranges (decades) are downsampled by Horizons itself via
   STEP_SIZE="<intervals>", giving exactly ~`samples` ephemeris points.
3. Run the standard sonification pipeline on those points.
4. Compute "cosmic facts" (age in planet-years, orbits completed, etc.).
5. Persist a Gift record under `data/gifts/<token>.json` so a
   shareable `/gift/<token>` link keeps working after the request ends.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from scripts.data_fetcher import (
    DataValidationError,
    PLANET_IDS,
    fetch_or_load_dataset_range,
)
from scripts.hybrid_audio import render_events_to_wav
from scripts.sonifier import generate_note_events, save_symphony_midi_from_events
from services.birthday_arrangement import apply_birthday_arrangement
from services.encyclopedia_data import get_planet
from services.generation_service import (
    MixOptions,
    _artifact_base,
    _events_to_piano_roll,
    _render_hybrid_if_needed,
    _try_fluid_hq,
)
from services.harmony_engine import compute_sonification_metrics
from services.music_styles import BIRTHDAY_STYLE_IDS, get_style, is_birthday_style
from services.sonification_explanation import build_sonification_explanation

logger = logging.getLogger("ai_star_composer")

# Valid token shape — 24 lowercase hex chars. Anything else is rejected
# at both write and read time, so a public `/gift/<token>` cannot escape
# the gifts directory via path traversal.
GIFT_TOKEN_RE = re.compile(r"^[a-f0-9]{24}$")

# Recipient/sender names are rendered on the Cosmic Card. We keep them
# narrow (letters, spaces, common punctuation) to avoid XSS surface or
# extreme line-wrap issues on the printed/shareable card.
_NAME_RE = re.compile(r"^[\w \-'\.\u00C0-\u024F\u0600-\u06FF]{1,40}$", re.UNICODE)
_MESSAGE_MAX_LEN = 240

# Window sizing for the "birth-to-now" sonification. The sonifier needs
# at least ~24 events for harmony to feel coherent; above 120 the
# response grows past a few hundred KB without adding musical value.
SAMPLES_MIN = 24
SAMPLES_MAX = 120
SAMPLES_DEFAULT = 60

# Minimum age (days) for a meaningful gift. Anything shorter than ~2
# months yields nearly-flat orbital data because most planets only
# sweep a tiny arc in that time.
MIN_AGE_DAYS = 60


@dataclass
class BirthdayInputs:
    """Validated payload used internally by the service."""

    recipient_name: str
    birth_date: str  # YYYY-MM-DD (validated)
    planet: str
    style_id: str
    mode: str  # "baseline" | "ai"
    seed: int
    samples: int
    sender_name: Optional[str]
    message: Optional[str]


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------
def _sanitize_name(value: Optional[str], field: str, *, allow_empty: bool) -> Optional[str]:
    if value is None:
        if allow_empty:
            return None
        raise DataValidationError(f"{field} is required")
    text = unicodedata.normalize("NFC", str(value)).strip()
    if not text:
        if allow_empty:
            return None
        raise DataValidationError(f"{field} is required")
    if len(text) > 40:
        raise DataValidationError(f"{field} must be <= 40 characters")
    if not _NAME_RE.match(text):
        raise DataValidationError(
            f"{field} contains unsupported characters (letters, spaces, '-., are fine)"
        )
    return text


def _sanitize_message(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = unicodedata.normalize("NFC", str(value)).strip()
    if not text:
        return None
    if len(text) > _MESSAGE_MAX_LEN:
        raise DataValidationError(
            f"message must be <= {_MESSAGE_MAX_LEN} characters"
        )
    # Strip control characters except newline/tab — they'd render as
    # mojibake on the printed card.
    cleaned = "".join(ch for ch in text if ch in "\n\t" or ord(ch) >= 0x20)
    return cleaned or None


def _validate_birth_date(value: str) -> Tuple[str, int]:
    """Return (iso_date, age_in_days). Rejects future / too-recent dates."""
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise DataValidationError("birth_date must be YYYY-MM-DD") from exc
    today = datetime.now(timezone.utc).date()
    age_days = (today - parsed).days
    if age_days < MIN_AGE_DAYS:
        raise DataValidationError(
            f"birth_date must be at least {MIN_AGE_DAYS} days ago "
            "to produce a meaningful planet song"
        )
    floor = datetime(1900, 1, 1).date()
    if parsed < floor:
        raise DataValidationError("birth_date must be on or after 1900-01-01")
    return parsed.strftime("%Y-%m-%d"), age_days


def _normalize_planet(value: str) -> str:
    if not value:
        raise DataValidationError("planet is required")
    cap = str(value).strip().capitalize()
    if cap not in PLANET_IDS:
        raise DataValidationError(f"unknown planet: {value}")
    return cap


def validate_inputs(
    *,
    recipient_name: str,
    birth_date: str,
    planet: str,
    style_id: str = "celebration",
    mode: str = "ai",
    seed: Optional[int] = None,
    samples: int = SAMPLES_DEFAULT,
    sender_name: Optional[str] = None,
    message: Optional[str] = None,
) -> BirthdayInputs:
    name = _sanitize_name(recipient_name, "recipient_name", allow_empty=False)
    sender = _sanitize_name(sender_name, "sender_name", allow_empty=True)
    msg = _sanitize_message(message)
    iso_birth, _age_days = _validate_birth_date(birth_date)
    norm_planet = _normalize_planet(planet)
    # Birthday accepts ONLY the dedicated gift styles; the Studio's data-
    # sonification presets (calm/pop/study/cinematic) are intentionally
    # rejected here so the gift always feels purpose-built.
    if not is_birthday_style(style_id):
        raise DataValidationError(
            f"invalid style_id: {style_id!r} — must be one of {list(BIRTHDAY_STYLE_IDS)}"
        )
    if mode not in {"baseline", "ai"}:
        raise DataValidationError(f"invalid mode: {mode}")
    if samples < SAMPLES_MIN or samples > SAMPLES_MAX:
        raise DataValidationError(
            f"samples must be in [{SAMPLES_MIN}, {SAMPLES_MAX}]"
        )
    # Derive a deterministic seed from the birth date + recipient name when
    # the caller doesn't pass one. Same person + same planet always gets
    # the same song — that's the whole point of an annual gift.
    if seed is None:
        digest = hashlib.sha256(
            f"{name}|{iso_birth}|{norm_planet}".encode("utf-8")
        ).digest()
        seed = int.from_bytes(digest[:4], "big") % 2_000_000_000
    if seed < 0 or seed > 2_000_000_000:
        raise DataValidationError("seed out of range")
    return BirthdayInputs(
        recipient_name=name or "",
        birth_date=iso_birth,
        planet=norm_planet,
        style_id=style_id,
        mode=mode,
        seed=int(seed),
        samples=int(samples),
        sender_name=sender,
        message=msg,
    )


# ---------------------------------------------------------------------------
# Cosmic facts
# ---------------------------------------------------------------------------
def _planet_period_days(planet: str) -> float:
    facts = get_planet(planet) or {}
    physics = facts.get("physics", {}) or {}
    period = physics.get("orbital_period_days")
    if isinstance(period, (int, float)) and period > 0:
        return float(period)
    # Defensive fallback — keep the feature alive even if planet_facts.json
    # is missing a key. The Earth year is a sensible neutral default.
    return 365.256


_KM_PER_AU = 149_597_870.7
_SEC_PER_DAY = 86400.0


def _approx_distance_traveled_km(points: List[Dict[str, Any]], age_days: float) -> float:
    """Trapezoidal integration of |v|·dt across the sampled window.

    Horizons returns velocity vectors in km/s when EPHEM_TYPE=VECTORS
    is used with the default OUT_UNITS (KM-S), so `speed` is already
    in km/s and we only need to convert each interval to seconds.
    """
    if len(points) < 2:
        return 0.0
    seconds_per_interval = (age_days / max(len(points) - 1, 1)) * _SEC_PER_DAY
    total_km = 0.0
    for a, b in zip(points[:-1], points[1:]):
        sa = float(a.get("speed") or 0.0)
        sb = float(b.get("speed") or 0.0)
        total_km += 0.5 * (sa + sb) * seconds_per_interval
    return total_km


def _next_anniversary_in_planet_years(age_in_planet_years: float) -> float:
    """Distance (in planet-years) to the next whole anniversary."""
    next_whole = math.floor(age_in_planet_years) + 1
    return max(0.0, next_whole - age_in_planet_years)


def compute_cosmic_facts(
    *,
    planet: str,
    birth_date: str,
    points: List[Dict[str, Any]],
) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    birth = datetime.strptime(birth_date, "%Y-%m-%d").date()
    age_days = max(0, (today - birth).days)
    period_days = _planet_period_days(planet)
    age_planet_years = age_days / period_days if period_days > 0 else 0.0
    orbits_completed = math.floor(age_planet_years)
    distance_km = _approx_distance_traveled_km(points, age_days)
    speeds = [float(p.get("speed") or 0.0) for p in points if isinstance(p, dict)]
    avg_speed_km_s = (sum(speeds) / len(speeds)) if speeds else 0.0
    return {
        "age_days": age_days,
        "age_earth_years": round(age_days / 365.2425, 3),
        "planet_orbital_period_days": round(period_days, 3),
        "age_in_planet_years": round(age_planet_years, 3),
        "orbits_completed_since_birth": int(orbits_completed),
        "next_anniversary_in_planet_years": round(
            _next_anniversary_in_planet_years(age_planet_years), 3
        ),
        "approx_distance_traveled_km": int(round(distance_km)),
        "approx_distance_traveled_au": round(distance_km / _KM_PER_AU, 3),
        "average_orbital_speed_km_s": round(avg_speed_km_s, 3),
        "today_utc": today.isoformat(),
    }


# ---------------------------------------------------------------------------
# Persistence (shareable /gift/<token>)
# ---------------------------------------------------------------------------
def _gifts_dir(data_dir: str) -> Path:
    base = Path(data_dir) / "gifts"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _gift_path(data_dir: str, token: str) -> Path:
    if not GIFT_TOKEN_RE.match(token):
        raise DataValidationError("invalid gift token")
    return _gifts_dir(data_dir) / f"{token}.json"


def _new_token() -> str:
    return secrets.token_hex(12)


def _basename(path: Optional[str]) -> Optional[str]:
    """Strip directory + only return the filename of an artifact path.

    The persisted gift is *served* through `/artifacts/<filename>`, so we
    intentionally do NOT store absolute paths (those would leak the
    server layout and break a redeployed copy of the app).
    """
    if not path:
        return None
    return Path(path).name


def save_gift(
    *,
    token: Optional[str],
    inputs: BirthdayInputs,
    artifacts: Dict[str, Any],
    cosmic_facts: Dict[str, Any],
    data_dir: str,
) -> str:
    """Persist a Gift record. Returns the canonical token."""
    tok = token or _new_token()
    if not GIFT_TOKEN_RE.match(tok):
        raise DataValidationError("invalid gift token")
    payload = {
        "schema_version": 1,
        "token": tok,
        "created_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "recipient_name": inputs.recipient_name,
        "sender_name": inputs.sender_name,
        "message": inputs.message,
        "birth_date": inputs.birth_date,
        "planet": inputs.planet,
        "style": inputs.style_id,
        "mode": inputs.mode,
        "seed": inputs.seed,
        "samples": inputs.samples,
        "cosmic_facts": cosmic_facts,
        "artifacts": {
            "midi": _basename(artifacts.get("midi")),
            "melody_wav": _basename(artifacts.get("melody_wav")),
            "melody_hq_wav": _basename(artifacts.get("melody_hq_wav")),
            "hybrid_wav": _basename(artifacts.get("hybrid_wav")),
        },
        "bpm": artifacts.get("bpm"),
        "piano_roll": artifacts.get("piano_roll"),
        "sonification_metrics": artifacts.get("sonification_metrics"),
        "explanation": artifacts.get("explanation"),
        "fluid_render_warning": artifacts.get("fluid_render_warning"),
        "lstm_blend": artifacts.get("lstm_blend"),
    }
    path = _gift_path(data_dir, tok)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Saved birthday gift token=%s planet=%s", tok, inputs.planet)
    return tok


def load_gift(token: str, data_dir: str) -> Dict[str, Any]:
    path = _gift_path(data_dir, token)
    if not path.is_file():
        raise FileNotFoundError(token)
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------
def generate_birthday_song(
    inputs: BirthdayInputs,
    *,
    data_dir: str,
    outputs_dir: str,
    soundfont_path: Optional[str] = None,
    fluidsynth_bin: str = "fluidsynth",
    lstm_checkpoint_path: Optional[str] = None,
    lstm_device: str = "cpu",
    lstm_temperature: float = 0.92,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Run the full pipeline and return (artifacts, cosmic_facts).

    Artifacts include MIDI/WAV paths, piano_roll, explanation, metrics —
    the same shape as `generation_service.generate_artifacts()` so the
    Studio UI can render this with its existing components.
    """
    today_iso = datetime.now(timezone.utc).date().isoformat()
    dataset, _data_path, cached = fetch_or_load_dataset_range(
        planet_name=inputs.planet,
        start_date=inputs.birth_date,
        end_date=today_iso,
        samples=inputs.samples,
        data_dir=data_dir,
    )
    points = dataset["points"]
    if not points:
        raise ValueError("No NASA points returned for the requested birth window.")

    events = generate_note_events(
        points,
        seed=inputs.seed,
        mode=inputs.mode,
        style_id=inputs.style_id,
        planet_name=inputs.planet,
    )
    lstm_meta: Dict[str, Any] = {}
    ckpt = (lstm_checkpoint_path or "").strip()
    if ckpt:
        from services.lstm_blend import apply_lstm_checkpoint_to_events

        events, lstm_meta = apply_lstm_checkpoint_to_events(
            events,
            points,
            inputs.style_id,
            inputs.seed,
            ckpt,
            device=lstm_device,
            planet_name=inputs.planet,
            temperature=lstm_temperature,
        )
    st = get_style(inputs.style_id)

    # Birthday-only enrichment: velocity envelope (intro→build→climax→outro),
    # ritardando on the final phrase, and pad + arpeggio layers.  Studio
    # `/generate` does NOT call this — the goal here is to make the gift
    # feel like a real production, not a raw sonification.
    events = apply_birthday_arrangement(events, st, seed=inputs.seed)
    mid_suffix = f"birthday_{inputs.mode}_{st.id}_symphony"
    midi_path = save_symphony_midi_from_events(
        events, inputs.planet, inputs.style_id, outputs_dir, filename_suffix=mid_suffix
    )
    base = f"{_artifact_base(inputs.planet, inputs.mode, inputs.style_id)}_birthday"
    wav_path = render_events_to_wav(
        events, f"{outputs_dir}/{base}_melody.wav", bpm=st.bpm, style_id=inputs.style_id
    )
    hybrid_path = _render_hybrid_if_needed(
        wav_path, inputs.planet, inputs.mode, inputs.style_id, outputs_dir, MixOptions()
    )
    hq_wav, hq_err = _try_fluid_hq(
        midi_path, outputs_dir, base, soundfont_path, fluidsynth_bin
    )
    # The arrangement pass appended `layer="pad"`/"arp" events that lack
    # `base_note`/`harmony`/etc.  Metrics + piano-roll + explanation are
    # designed around the original chord events only, so strip the
    # enrichment layers before handing them off.
    chord_events = [e for e in events if "layer" not in e]
    metrics = compute_sonification_metrics(chord_events)
    explanation = build_sonification_explanation(
        planet=inputs.planet,
        style_id=inputs.style_id,
        points=points,
        events=chord_events,
        days=max(1, len(points)),
        seed=inputs.seed,
        mode=inputs.mode,
        lstm_meta=lstm_meta,
    )

    cosmic_facts = compute_cosmic_facts(
        planet=inputs.planet, birth_date=inputs.birth_date, points=points
    )

    artifacts: Dict[str, Any] = {
        "planet": inputs.planet,
        "mode": inputs.mode,
        "style": inputs.style_id,
        "count": dataset["count"],
        "metadata": dataset.get("metadata", {}),
        "data_cached": cached,
        "midi": midi_path,
        "melody_wav": wav_path,
        "melody_hq_wav": hq_wav,
        "hybrid_wav": hybrid_path,
        "sonification_metrics": metrics,
        "piano_roll": _events_to_piano_roll(chord_events),
        "bpm": st.bpm,
        "explanation": explanation,
    }
    if hq_err:
        artifacts["fluid_render_warning"] = hq_err
    if lstm_meta:
        artifacts["lstm_blend"] = lstm_meta
    return artifacts, cosmic_facts
