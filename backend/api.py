"""
AI Star Composer — FastAPI backend.

Hardened version (post Strict Review Sprint 0):
- Structured logging with request-id correlation
- Path traversal protection on /artifacts/{filename}
- User-provided absolute file paths removed from the public API
  (SoundFont + LSTM checkpoint are sourced from server .env only;
   NASA background WAV is a whitelisted *filename* inside ALLOWED_BG_DIR).
- /generate and /compare run sync work in a worker thread (asyncio.to_thread)
  so the event loop is not blocked.
- WebSocket /live/ws validates all query params, caps concurrent sessions,
  sends keep-alive pings, and exits cleanly on disconnect.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from scripts.bootstrap import ensure_project_layout, init_environment
from scripts.data_fetcher import DataValidationError, cleanup_outputs
from scripts.evaluate_baseline_vs_ai import (
    aggregate_reports,
    run_pair as _eval_run_pair,
)
from scripts.settings import load_settings
from services.birthday_service import (
    GIFT_TOKEN_RE,
    SAMPLES_DEFAULT,
    SAMPLES_MAX,
    SAMPLES_MIN,
    generate_birthday_song,
    load_gift,
    save_gift,
    validate_inputs,
)
from services.fluid_render import fluidsynth_executable
from services.generation_service import MixOptions, compare_modes, generate_artifacts
from services.live_stream_service import build_live_event_stream
from services.lstm_blend import resolve_lstm_path
from services.mission_data import HISTORIC_MISSIONS, get_artemis_i_trajectory
from services.music_styles import (
    BIRTHDAY_STYLE_IDS,
    list_birthday_styles,
    list_styles,
)

ensure_project_layout(".")
init_environment(".")
settings = load_settings()

logger = logging.getLogger("ai_star_composer")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s [rid=%(request_id)s] %(message)s"
        )
    )
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class _RequestIdFilter(logging.Filter):
    """Inject 'request_id' into every record so the formatter never crashes."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


for h in logger.handlers:
    h.addFilter(_RequestIdFilter())


# ---------------------------------------------------------------------------
# Whitelisted directories. Everything served / read from disk MUST be inside.
# ---------------------------------------------------------------------------
OUTPUTS_DIR = Path(settings.outputs_dir).resolve()
DATA_DIR = Path(settings.data_dir).resolve()
ALLOWED_BG_DIR = Path("assets/backgrounds").resolve()
ALLOWED_BG_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ARTIFACT_EXT = {".wav", ".mid", ".midi", ".json"}
SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,160}$")

# Concurrent WebSocket session cap. Studio is single-user; this protects the
# server from accidental tab-reload storms.
MAX_LIVE_SESSIONS = 4
LIVE_WS_HEARTBEAT_SEC = 20.0

# Outputs older than this are removed at startup and every hour by a background
# task. 24h is enough for a demo session while preventing the artifacts folder
# from growing unboundedly across days.
OUTPUTS_TTL_SEC = 24 * 3600
OUTPUTS_SWEEP_INTERVAL_SEC = 3600

# Evaluation endpoint guardrails: max number of paired generations served live.
# Each pair runs ~5-9s on the reference machine, so 12 pairs ≈ 90s wall-time
# — at the upper edge of what we want to keep in a single HTTP request.
EVAL_MAX_PAIRS = 12
EVAL_REPORT_PATH = Path("docs/evaluation_raw.json").resolve()


async def _outputs_sweep_loop() -> None:
    """Periodic retention sweep so long-running servers stay clean."""
    while True:
        try:
            removed = await asyncio.to_thread(
                cleanup_outputs, settings.outputs_dir, OUTPUTS_TTL_SEC
            )
            if removed:
                logger.info(
                    "outputs sweep removed %d file(s)",
                    removed,
                    extra={"request_id": "sweep"},
                )
        except Exception:
            logger.exception("outputs sweep failed", extra={"request_id": "sweep"})
        await asyncio.sleep(OUTPUTS_SWEEP_INTERVAL_SEC)


# ---------------------------------------------------------------------------
# App + lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def _lifespan(_app: FastAPI):
    boot_log = {"request_id": "boot"}
    logger.info(
        "AI Star Composer API starting | outputs=%s | data=%s | bg=%s",
        OUTPUTS_DIR,
        DATA_DIR,
        ALLOWED_BG_DIR,
        extra=boot_log,
    )
    # Initial sweep — clears whatever piled up while the server was off.
    try:
        removed = await asyncio.to_thread(
            cleanup_outputs, settings.outputs_dir, OUTPUTS_TTL_SEC
        )
        if removed:
            logger.info("startup retention removed %d files", removed, extra=boot_log)
    except Exception:
        logger.exception("startup retention failed", extra=boot_log)
    sweep_task = asyncio.create_task(_outputs_sweep_loop())
    try:
        yield
    finally:
        sweep_task.cancel()
        try:
            await sweep_task
        except (asyncio.CancelledError, Exception):
            pass
        logger.info("AI Star Composer API shutting down", extra=boot_log)


app = FastAPI(title="AI Star Composer API", version="0.2.0", lifespan=_lifespan)

# CORS:
# - Local dev: any localhost / 127.0.0.1 port (Vite at 5173, FastAPI at 8000…).
# - Production: an explicit frontend origin set via ALLOWED_FRONTEND_ORIGIN.
#   This is typically the Vercel URL (e.g. https://ai-star-composer.vercel.app).
#   Both *.vercel.app preview deployments and the configured production URL
#   are accepted so that Vercel preview links also work for the jury.
_extra_origin = (os.getenv("ALLOWED_FRONTEND_ORIGIN") or "").strip().rstrip("/")
_cors_regex_parts = [r"http://(localhost|127\.0\.0\.1)(:\d+)?", r"https://([a-z0-9-]+\.)*vercel\.app"]
if _extra_origin:
    _cors_regex_parts.append(re.escape(_extra_origin))
_cors_regex = r"^(?:" + "|".join(_cors_regex_parts) + r")$"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)


@app.middleware("http")
async def _request_id_and_timing(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    log_extra = {"request_id": rid}
    try:
        response = await call_next(request)
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000.0
        logger.exception(
            "Unhandled error: %s %s | %.1fms",
            request.method,
            request.url.path,
            elapsed,
            extra=log_extra,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error.", "request_id": rid},
            headers={"X-Request-ID": rid},
        )
    elapsed = (time.perf_counter() - start) * 1000.0
    logger.info(
        "%s %s -> %s | %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
        extra=log_extra,
    )
    response.headers["X-Request-ID"] = rid
    return response


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
PLANET_NAME_RE = r"^[A-Za-z]{3,15}$"


class GenerateRequest(BaseModel):
    planet: str = Field(default="Mars", pattern=PLANET_NAME_RE)
    days: int = Field(default=30, ge=7, le=365)
    mode: Literal["baseline", "ai"] = "ai"
    style: Literal["calm", "pop", "study", "cinematic", "drone"] = "calm"
    # Background mixing: caller passes a filename ONLY. The server resolves it
    # inside ALLOWED_BG_DIR. Absolute paths and ".." are rejected.
    nasa_background_name: Optional[str] = Field(default=None, max_length=160)
    fg_gain: float = Field(default=0.85, ge=0.1, le=1.5)
    bg_gain: float = Field(default=0.35, ge=0.0, le=1.5)
    fade_ms: int = Field(default=80, ge=0, le=5000)
    ducking: bool = True
    ducking_strength: float = Field(default=0.45, ge=0.0, le=1.0)
    seed: int = Field(default=42, ge=0, le=2_000_000_000)
    use_lstm: bool = False
    lstm_device: Literal["cpu", "cuda"] = "cpu"
    # Sampling temperature for the LSTM head. Lower = more deterministic /
    # tighter to training distribution; higher = more exploratory.
    lstm_temperature: float = Field(default=0.92, ge=0.1, le=1.8)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _resolve_nasa_background(name: Optional[str]) -> Optional[str]:
    """Resolve a user-supplied background filename safely.

    Returns the absolute path if the file exists inside ALLOWED_BG_DIR,
    otherwise raises HTTPException(400). Returns None when no name was given.
    """
    if not name:
        return None
    name = name.strip()
    if not name:
        return None
    if not SAFE_FILENAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid background filename.")
    if not name.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Background must be a .wav file.")
    candidate = (ALLOWED_BG_DIR / name).resolve()
    if not candidate.is_file() or ALLOWED_BG_DIR not in candidate.parents:
        raise HTTPException(status_code=404, detail="Background file not found.")
    return str(candidate)


def _server_soundfont() -> Optional[str]:
    """Server-only SoundFont. The API never accepts a path from the client."""
    sf = (settings.soundfont_path or "").strip()
    if not sf:
        return None
    p = Path(sf).resolve()
    return str(p) if p.is_file() else None


def _server_lstm_checkpoint(use_lstm: bool, *, prefer_birthday: bool = False) -> Optional[str]:
    if not use_lstm:
        return None
    # When the request comes through /birthday we prefer the dedicated
    # birthday-aware checkpoint (trained with all 9 styles incl. the 5
    # gift personas) when it is on disk. Studio /generate keeps the
    # original .env-configured checkpoint.
    if prefer_birthday:
        candidate = Path("ml/checkpoints/note_lstm_birthday_v1.pt")
        if candidate.is_file():
            return str(candidate.resolve())
    # Server .env or auto-discover inside ml/checkpoints — never client-controlled.
    return resolve_lstm_path(None, settings.lstm_checkpoint_path or None) or None


def _safe_artifact_path(filename: str) -> Path:
    """Reject path traversal, absolute paths, and unknown extensions."""
    if not filename or not SAFE_FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid artifact name.")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_ARTIFACT_EXT:
        raise HTTPException(status_code=400, detail="Disallowed file type.")
    target = (OUTPUTS_DIR / filename).resolve()
    if OUTPUTS_DIR not in target.parents and target != OUTPUTS_DIR:
        raise HTTPException(status_code=400, detail="Path escapes outputs dir.")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return target


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health(detailed: bool = False):
    fs_resolved: Optional[str] = None
    try:
        fs_resolved = fluidsynth_executable(settings.fluidsynth_bin)
    except Exception:
        logger.exception("fluidsynth probe failed", extra={"request_id": "health"})
    lstm_ready = bool(_server_lstm_checkpoint(True))
    body = {
        "status": "ok",
        "api_version": app.version,
        "fluidsynth_on_path": fs_resolved is not None,
        "soundfont_configured": bool(settings.soundfont_path),
        "lstm_checkpoint_ready": lstm_ready,
    }
    # Detailed mode leaks server-side paths and is meant for local diagnostics.
    if detailed:
        body.update(
            {
                "fluidsynth_resolved": fs_resolved,
                "fluidsynth_bin_setting": settings.fluidsynth_bin,
                "data_dir": str(DATA_DIR),
                "outputs_dir": str(OUTPUTS_DIR),
                "allowed_bg_dir": str(ALLOWED_BG_DIR),
            }
        )
    return body


@app.get("/styles")
def styles():
    return {"styles": list_styles()}


@app.get("/render/capabilities")
def render_capabilities():
    try:
        fs_ok = fluidsynth_executable(settings.fluidsynth_bin) is not None
    except Exception:
        fs_ok = False
        logger.exception("capabilities probe failed", extra={"request_id": "caps"})
    return {
        "fluidsynth_found": fs_ok,
        "soundfont_configured": bool(settings.soundfont_path),
        "lstm_checkpoint_ready": bool(_server_lstm_checkpoint(True)),
        "max_live_sessions": MAX_LIVE_SESSIONS,
    }


@app.get("/backgrounds")
def list_backgrounds():
    """Public list of background .wav filenames usable in /generate."""
    items = []
    if ALLOWED_BG_DIR.is_dir():
        for p in sorted(ALLOWED_BG_DIR.iterdir()):
            if p.is_file() and p.suffix.lower() == ".wav":
                items.append(p.name)
    return {"backgrounds": items}


def _build_mix_options(req: GenerateRequest) -> MixOptions:
    return MixOptions(
        nasa_background_wav=_resolve_nasa_background(req.nasa_background_name),
        fg_gain=req.fg_gain,
        bg_gain=req.bg_gain,
        fade_ms=req.fade_ms,
        ducking=req.ducking,
        ducking_strength=req.ducking_strength,
    )


def _generate_blocking(req: GenerateRequest):
    return generate_artifacts(
        planet=req.planet,
        days=req.days,
        seed=req.seed,
        data_dir=settings.data_dir,
        outputs_dir=settings.outputs_dir,
        mix_options=_build_mix_options(req),
        mode=req.mode,
        style_id=req.style,
        soundfont_path=_server_soundfont(),
        fluidsynth_bin=settings.fluidsynth_bin,
        lstm_checkpoint_path=_server_lstm_checkpoint(req.use_lstm),
        lstm_device=req.lstm_device,
        lstm_temperature=req.lstm_temperature,
    )


def _compare_blocking(req: GenerateRequest):
    return compare_modes(
        planet=req.planet,
        days=req.days,
        seed=req.seed,
        data_dir=settings.data_dir,
        outputs_dir=settings.outputs_dir,
        mix_options=_build_mix_options(req),
        style_id=req.style,
        soundfont_path=_server_soundfont(),
        fluidsynth_bin=settings.fluidsynth_bin,
        lstm_checkpoint_path=_server_lstm_checkpoint(req.use_lstm),
        lstm_device=req.lstm_device,
        lstm_temperature=req.lstm_temperature,
    )


@app.post("/generate")
async def generate(req: GenerateRequest):
    try:
        return await asyncio.to_thread(_generate_blocking, req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("/generate failed", extra={"request_id": "-"})
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/compare")
async def compare(req: GenerateRequest):
    """Same NASA window, two sonification modes, metrics side-by-side."""
    try:
        return await asyncio.to_thread(_compare_blocking, req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("/compare failed", extra={"request_id": "-"})
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/artifacts/{filename}")
def artifact(filename: str):
    return FileResponse(_safe_artifact_path(filename))


# --- Bundle export --------------------------------------------------------
#
# Packs every artifact for a single generation (.mid, .wav, .json data,
# metrics) into a single zip download. The stem is matched against
# SAFE_FILENAME_RE so it cannot escape OUTPUTS_DIR.
EXPORT_STEM_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
EXPORT_BUNDLE_EXT = (".mid", ".midi", ".wav")


@app.get("/export/{stem}.zip")
async def export_bundle(stem: str):
    if not EXPORT_STEM_RE.match(stem):
        raise HTTPException(status_code=400, detail="invalid stem")

    import io
    import json
    import zipfile

    def _build_zip() -> bytes:
        outputs = OUTPUTS_DIR
        data_dir = DATA_DIR
        # MIDI filenames end in "_symphony" while WAV variants do not. We
        # therefore search by the *base* stem (everything before the final
        # "_symphony" / "_melody" / "_hq" / "_hybrid" segment) so a single
        # request collects all the audio formats produced by /generate.
        SUFFIXES = ("_symphony", "_melody", "_hq", "_hybrid")
        base_stem = stem
        for suffix in SUFFIXES:
            if base_stem.endswith(suffix):
                base_stem = base_stem[: -len(suffix)]
                break

        matches: list[Path] = []
        for p in outputs.iterdir():
            if not p.is_file():
                continue
            if not p.name.startswith(base_stem):
                continue
            if p.suffix.lower() not in EXPORT_BUNDLE_EXT:
                continue
            # Defensive: ensure the resolved path is still inside the dir.
            if not p.resolve().is_relative_to(outputs):
                continue
            matches.append(p)
        if not matches:
            raise HTTPException(status_code=404, detail="no artifacts for stem")

        # Try to attach the most recent NASA dataset for the planet inferred
        # from the stem prefix (everything before the first underscore).
        planet_prefix = base_stem.split("_")[0]
        data_files = sorted(
            (
                p
                for p in data_dir.glob(f"{planet_prefix}*.json")
                if p.is_file() and p.resolve().is_relative_to(data_dir)
            ),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            readme = (
                "# AI Star Composer — Export Bundle\n\n"
                f"Stem: {base_stem}\n"
                f"Generated artifacts: {len(matches)}\n"
                f"Data file attached: {bool(data_files)}\n\n"
                "Files:\n"
                + "\n".join(f"- artifacts/{p.name}" for p in matches)
                + ("\n- data/<latest>.json" if data_files else "")
                + "\n\nLicense: educational use (graduation project). Original\n"
                "ephemeris data © NASA/JPL-Caltech Horizons system.\n"
            )
            zf.writestr("README.md", readme)
            zf.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "stem": base_stem,
                        "request_stem": stem,
                        "artifacts": [p.name for p in matches],
                        "data_json": data_files[0].name if data_files else None,
                    },
                    indent=2,
                ),
            )
            for p in matches:
                zf.write(p, arcname=f"artifacts/{p.name}")
            if data_files:
                zf.write(data_files[0], arcname=f"data/{data_files[0].name}")
        return buf.getvalue()

    try:
        payload = await asyncio.to_thread(_build_zip)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("/export failed", extra={"request_id": "-"})
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    from fastapi.responses import Response

    return Response(
        content=payload,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{stem}.zip"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/mission/artemis")
async def mission_artemis():
    """Artemis I trajectory anchored to real JPL Horizons Moon ephemeris.

    Falls back to a deterministic offline path if Horizons is unreachable
    (the response advertises which one was used via `source`).
    """
    try:
        return await asyncio.to_thread(get_artemis_i_trajectory)
    except Exception as exc:
        logger.exception("/mission/artemis failed", extra={"request_id": "-"})
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/mission/historic")
def mission_historic():
    """Static, citation-backed list of space missions for the timeline UI."""
    return {"missions": HISTORIC_MISSIONS}


# ---------------------------------------------------------------------------
# Educational encyclopedia + orbital lab endpoints
# ---------------------------------------------------------------------------
from services.encyclopedia_data import get_all_planets, get_planet  # noqa: E402
from services.orbital_lab import (  # noqa: E402
    kepler_period_days,
    keplerian_points,
    synthetic_dataset,
)

ENCYC_PLANET_RE = re.compile(r"^[A-Za-z]{1,16}$")


@app.get("/encyclopedia/planets")
def encyclopedia_planets():
    """Return the full planet encyclopedia (physics, missions, citations)."""
    return get_all_planets()


@app.get("/encyclopedia/planets/{name}")
def encyclopedia_planet(name: str):
    if not ENCYC_PLANET_RE.match(name):
        raise HTTPException(status_code=400, detail="invalid planet name")
    data = get_planet(name)
    if data is None:
        raise HTTPException(status_code=404, detail=f"unknown planet: {name}")
    return data


# --- Compare two planets ---------------------------------------------------
# Side-by-side analysis: same days/seed/style on both planets, compute deltas
# on the sonification metrics. Useful for "Mercury vs Pluto" classroom demos.

COMPARE_PLANETS_VALID = {
    "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
}


class ComparePlanetsRequest(BaseModel):
    planet_a: str
    planet_b: str
    days: int = Field(default=30, ge=1, le=120)
    seed: int = Field(default=42, ge=0, le=2_000_000_000)
    style_id: str = Field(default="calm")
    mode: Literal["baseline", "ai"] = "baseline"


@app.post("/compare/planets")
async def compare_planets(req: ComparePlanetsRequest):
    if req.planet_a == req.planet_b:
        raise HTTPException(status_code=400, detail="planet_a and planet_b must differ")
    if req.planet_a not in COMPARE_PLANETS_VALID or req.planet_b not in COMPARE_PLANETS_VALID:
        raise HTTPException(status_code=400, detail="unknown planet")
    if req.style_id not in {"calm", "pop", "study", "cinematic", "drone"}:
        raise HTTPException(status_code=400, detail="invalid style_id")

    # Use the same defaults as `/generate` would for an unspecified request.
    mix_opts = MixOptions()

    def _run(planet: str) -> Dict[str, Any]:
        return generate_artifacts(
            planet=planet,
            days=req.days,
            seed=req.seed,
            data_dir=str(DATA_DIR),
            outputs_dir=str(OUTPUTS_DIR),
            mix_options=mix_opts,
            mode=req.mode,
            style_id=req.style_id,
            soundfont_path=_server_soundfont(),
            fluidsynth_bin=settings.fluidsynth_bin,
            lstm_checkpoint_path=(
                resolve_lstm_path(None, settings.lstm_checkpoint_path or None) or None
                if req.mode == "ai"
                else None
            ),
            lstm_device=getattr(settings, "lstm_device", "cpu"),
            lstm_temperature=getattr(settings, "lstm_temperature", 0.92),
        )

    try:
        # Run both planets concurrently — each is a thread-bound, mostly
        # CPU+IO mix, so asyncio.gather + to_thread gives ~2x speedup.
        result_a, result_b = await asyncio.gather(
            asyncio.to_thread(_run, req.planet_a),
            asyncio.to_thread(_run, req.planet_b),
        )
    except Exception as exc:
        logger.exception("/compare/planets failed", extra={"request_id": "-"})
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Delta summary across sonification metrics.
    metrics_a = result_a.get("sonification_metrics", {}) or {}
    metrics_b = result_b.get("sonification_metrics", {}) or {}
    delta: Dict[str, Dict[str, float]] = {}
    for key in sorted(set(metrics_a) | set(metrics_b)):
        va = float(metrics_a.get(key, 0.0))
        vb = float(metrics_b.get(key, 0.0))
        delta[key] = {
            "a": round(va, 6),
            "b": round(vb, 6),
            "delta": round(vb - va, 6),
            "rel": round((vb - va) / max(abs(va), 1e-9), 4),
        }

    # Pull physical comparison straight from the encyclopedia for the UI.
    facts_a = get_planet(req.planet_a) or {}
    facts_b = get_planet(req.planet_b) or {}
    physics_a = facts_a.get("physics", {})
    physics_b = facts_b.get("physics", {})
    physics_delta: Dict[str, Dict[str, Any]] = {}
    for key in ("mean_distance_au", "orbital_period_days", "rotation_period_hours",
                "axial_tilt_deg", "eccentricity", "mean_radius_km", "gravity_g"):
        if key in physics_a and key in physics_b:
            va, vb = physics_a[key], physics_b[key]
            physics_delta[key] = {"a": va, "b": vb, "delta": vb - va}

    return {
        "planet_a": result_a,
        "planet_b": result_b,
        "comparison": {
            "metrics_delta": delta,
            "physics_delta": physics_delta,
            "headline": (
                f"{req.planet_a} vs {req.planet_b} — "
                f"{req.days} days · {req.style_id} · {req.mode} · seed {req.seed}"
            ),
        },
    }


# --- Orbital lab ------------------------------------------------------------
# Synthetic Keplerian orbits routed through the existing sonifier so the lab
# can play with eccentricity and semi-major axis without depending on NASA
# Horizons (and without rate-limit pressure for classroom use).

LAB_VALID_STYLES = {"calm", "pop", "study", "cinematic", "drone"}
LAB_OBJECT_NAME_RE = re.compile(r"^[\w \-'\(\),.]{1,40}$")


class OrbitalLabRequest(BaseModel):
    semi_major_axis_au: float = Field(default=1.0, ge=0.05, le=80.0)
    # Allow up to 0.99 so famous comets (Halley e=0.967, Hale-Bopp e=0.995)
    # work as presets. Above 0.99 the iterative Kepler solver gets shaky.
    eccentricity: float = Field(default=0.05, ge=0.0, le=0.99)
    days: int = Field(default=30, ge=1, le=1200)
    seed: int = Field(default=42, ge=0, le=2_000_000_000)
    style_id: str = Field(default="calm")
    mode: Literal["baseline", "ai"] = "baseline"
    object_name: str = Field(default="Custom Object")
    samples_per_day: int = Field(default=1, ge=1, le=8)


class OrbitalSummaryRequest(BaseModel):
    """Lightweight preview — no audio, just the orbit/curve samples for the
    SVG visualization. Used by the live slider in the lab."""

    semi_major_axis_au: float = Field(default=1.0, ge=0.05, le=80.0)
    eccentricity: float = Field(default=0.05, ge=0.0, le=0.99)
    samples: int = Field(default=240, ge=24, le=720)


@app.post("/lab/orbital/preview")
def lab_orbital_preview(req: OrbitalSummaryRequest):
    """Quick orbit + speed curve for the slider UI (no audio rendering)."""
    period_days = kepler_period_days(req.semi_major_axis_au)
    # Sample one full orbit so the SVG draws the complete ellipse.
    pts = keplerian_points(
        semi_major_axis_au=req.semi_major_axis_au,
        eccentricity=req.eccentricity,
        days_count=max(1, int(round(period_days))),
        samples_per_day=max(1, int(round(req.samples / max(period_days, 1.0)))),
    )
    # Down-sample to ~req.samples for the wire payload.
    step = max(1, len(pts) // req.samples)
    sampled = pts[::step][: req.samples]
    return {
        "period_days": period_days,
        "perihelion_au": req.semi_major_axis_au * (1.0 - req.eccentricity),
        "aphelion_au": req.semi_major_axis_au * (1.0 + req.eccentricity),
        "min_speed_km_s": min(p["speed"] for p in pts),
        "max_speed_km_s": max(p["speed"] for p in pts),
        "samples": [
            {
                "x": p["x"],
                "y": p["y"],
                "r": p["radius"],
                "v": p["speed"],
            }
            for p in sampled
        ],
    }


@app.post("/lab/orbital")
async def lab_orbital(req: OrbitalLabRequest):
    """Sonify a synthetic Keplerian orbit. Returns the same shape as /generate."""
    if req.style_id not in LAB_VALID_STYLES:
        raise HTTPException(status_code=400, detail="invalid style_id")
    if not LAB_OBJECT_NAME_RE.match(req.object_name):
        raise HTTPException(status_code=400, detail="invalid object_name")

    # We bypass NASA Horizons by injecting a synthetic dataset into the
    # generation service. To keep the public API surface compact we re-use
    # the existing generation pipeline directly here.
    from services.generation_service import (  # noqa: E402
        _events_to_piano_roll,
        _try_fluid_hq,
        MixOptions,
    )
    from services.harmony_engine import compute_sonification_metrics  # noqa: E402
    from services.music_styles import get_style  # noqa: E402
    from scripts.hybrid_audio import render_events_to_wav  # noqa: E402
    from scripts.sonifier import (  # noqa: E402
        generate_note_events,
        save_symphony_midi_from_events,
    )
    from services.sonification_explanation import (  # noqa: E402
        build_sonification_explanation,
    )

    def _run() -> Dict[str, Any]:
        dataset = synthetic_dataset(
            semi_major_axis_au=req.semi_major_axis_au,
            eccentricity=req.eccentricity,
            days_count=req.days,
            object_name=req.object_name,
        )
        points = dataset["points"]
        # The harmony engine uses planet name for voicing rules. We use a
        # neutral default ("Earth") so the lab does not silently pick a
        # planet's quirky timbre when the user types a fictional name.
        voicing_planet = "Earth"
        events = generate_note_events(
            points, seed=req.seed, mode=req.mode, style_id=req.style_id, planet_name=voicing_planet
        )
        st = get_style(req.style_id)
        safe_stem = re.sub(r"[^A-Za-z0-9_-]+", "_", req.object_name).strip("_") or "object"
        midi_path = save_symphony_midi_from_events(
            events,
            voicing_planet,
            req.style_id,
            str(OUTPUTS_DIR),
            filename_suffix=f"lab_{safe_stem}_{req.mode}_symphony",
        )
        base = f"lab_{safe_stem}_{req.mode}_{req.style_id}"
        wav_path = render_events_to_wav(
            events, f"{OUTPUTS_DIR}/{base}_melody.wav", bpm=st.bpm, style_id=req.style_id
        )
        hq_wav, hq_err = _try_fluid_hq(midi_path, str(OUTPUTS_DIR), base, None, "fluidsynth")
        metrics = compute_sonification_metrics(events)
        explanation = build_sonification_explanation(
            planet=req.object_name,
            style_id=req.style_id,
            points=points,
            events=events,
            days=req.days,
            seed=req.seed,
            mode=req.mode,
        )
        out: Dict[str, Any] = {
            "planet": req.object_name,
            "mode": req.mode,
            "style": req.style_id,
            "count": dataset["count"],
            "metadata": dataset["metadata"],
            "data_json": "synthetic-keplerian",
            "data_cached": False,
            "midi": midi_path,
            "melody_wav": wav_path,
            "melody_hq_wav": hq_wav,
            "hybrid_wav": None,
            "sonification_metrics": metrics,
            "piano_roll": _events_to_piano_roll(events),
            "bpm": st.bpm,
            "explanation": explanation,
        }
        if hq_err:
            out["fluid_render_warning"] = hq_err
        return out

    try:
        return await asyncio.to_thread(_run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("/lab/orbital failed", extra={"request_id": "-"})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Birthday Gift endpoints
# ---------------------------------------------------------------------------
# A Birthday Gift is a short "this is how your planet has been singing
# since you were born" sonification. The pipeline is the same as
# `/generate`, but:
#  - the NASA window is anchored to the recipient's birth_date (not today)
#  - the dataset is sampled (not 1d steps) so a 30-year span stays bounded
#  - the resulting artifacts + cosmic facts are persisted under a token
#    that is reachable via `/gift/<token>` for a shareable birthday card.
GIFTS_DIR = Path(settings.data_dir).resolve() / "gifts"
GIFTS_DIR.mkdir(parents=True, exist_ok=True)


class BirthdayRequest(BaseModel):
    recipient_name: str = Field(..., min_length=1, max_length=40)
    birth_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    planet: str = Field(..., pattern=PLANET_NAME_RE)
    # /birthday is restricted to dedicated gift styles, NOT the Studio
    # data-sonification presets.
    style: Literal["celebration", "tender", "anthem", "waltz", "nebula"] = "celebration"
    mode: Literal["baseline", "ai"] = "ai"
    seed: Optional[int] = Field(default=None, ge=0, le=2_000_000_000)
    samples: int = Field(default=SAMPLES_DEFAULT, ge=SAMPLES_MIN, le=SAMPLES_MAX)
    sender_name: Optional[str] = Field(default=None, max_length=40)
    message: Optional[str] = Field(default=None, max_length=240)
    # Default ON for birthday: the LSTM head pushes the melody from "scale-snapped
    # arpeggio" into something with real phrasing — which is exactly the
    # "wow" factor a personalised gift needs. Studio /generate keeps it
    # opt-in because some users want the pure baseline for comparisons.
    use_lstm: bool = True
    lstm_temperature: float = Field(default=0.92, ge=0.1, le=1.8)


def _gift_to_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Project a persisted gift into the shape returned by `/birthday`.

    The persisted record stores artifact *basenames* only; we resolve
    them to URLs the frontend can stream from `/artifacts/<name>`.
    """
    arts = payload.get("artifacts") or {}

    def _url(name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        # Defensive — refuse to expose anything that isn't a plain filename
        # inside the outputs dir (matches the /artifacts/<filename> contract).
        if not SAFE_FILENAME_RE.match(name):
            return None
        return f"/artifacts/{name}"

    return {
        "token": payload.get("token"),
        "created_at_utc": payload.get("created_at_utc"),
        "recipient_name": payload.get("recipient_name"),
        "sender_name": payload.get("sender_name"),
        "message": payload.get("message"),
        "birth_date": payload.get("birth_date"),
        "planet": payload.get("planet"),
        "style": payload.get("style"),
        "mode": payload.get("mode"),
        "seed": payload.get("seed"),
        "samples": payload.get("samples"),
        "bpm": payload.get("bpm"),
        "cosmic_facts": payload.get("cosmic_facts") or {},
        "piano_roll": payload.get("piano_roll"),
        "sonification_metrics": payload.get("sonification_metrics"),
        "explanation": payload.get("explanation"),
        "artifacts": {
            "midi": _url(arts.get("midi")),
            "melody_wav": _url(arts.get("melody_wav")),
            "melody_hq_wav": _url(arts.get("melody_hq_wav")),
            "hybrid_wav": _url(arts.get("hybrid_wav")),
        },
        # Surfaced for diagnostics so the UI can show "playing fallback synth"
        # instead of silently shipping the cheap sine render when FluidSynth
        # is misconfigured.
        "fluid_render_warning": payload.get("fluid_render_warning"),
        "lstm_blend": payload.get("lstm_blend"),
        "share_path": f"/gift/{payload.get('token')}",
    }


@app.get("/birthday/styles")
def birthday_styles_endpoint():
    """Catalog of the 5 dedicated birthday gift styles (label + description)."""
    return {"styles": list_birthday_styles(), "ids": list(BIRTHDAY_STYLE_IDS)}


@app.post("/birthday")
async def birthday_generate(req: BirthdayRequest):
    try:
        inputs = validate_inputs(
            recipient_name=req.recipient_name,
            birth_date=req.birth_date,
            planet=req.planet,
            style_id=req.style,
            mode=req.mode,
            seed=req.seed,
            samples=req.samples,
            sender_name=req.sender_name,
            message=req.message,
        )
    except DataValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _run():
        artifacts, cosmic = generate_birthday_song(
            inputs,
            data_dir=settings.data_dir,
            outputs_dir=settings.outputs_dir,
            soundfont_path=_server_soundfont(),
            fluidsynth_bin=settings.fluidsynth_bin,
            lstm_checkpoint_path=_server_lstm_checkpoint(
                req.use_lstm, prefer_birthday=True
            ),
            lstm_device="cpu",
            lstm_temperature=req.lstm_temperature,
        )
        token = save_gift(
            token=None,
            inputs=inputs,
            artifacts=artifacts,
            cosmic_facts=cosmic,
            data_dir=settings.data_dir,
        )
        # Re-load through the canonical projection so the response shape
        # is identical to GET /gift/<token>.
        payload = load_gift(token, settings.data_dir)
        return _gift_to_response(payload)

    try:
        return await asyncio.to_thread(_run)
    except DataValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("/birthday failed", extra={"request_id": "-"})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/gift/{token}")
def get_gift(token: str):
    if not GIFT_TOKEN_RE.match(token):
        raise HTTPException(status_code=400, detail="invalid gift token")
    try:
        payload = load_gift(token, settings.data_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="gift not found") from exc
    except DataValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _gift_to_response(payload)


# ---------------------------------------------------------------------------
# Statistical evaluation endpoints
# ---------------------------------------------------------------------------
# `/evaluation/latest` serves the JSON produced by the offline script
# (`docs/evaluation_raw.json`). `/evaluation/run` reruns it inline with a
# small grid, capped at EVAL_MAX_PAIRS pairs so the request stays under
# ~90s; larger grids should be run via the CLI tool.

EVAL_VALID_PLANETS = {
    "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
}
EVAL_VALID_STYLES = {"calm", "pop", "study", "cinematic", "drone"}


class EvaluationRequest(BaseModel):
    planets: list[str] = Field(default_factory=lambda: ["Earth", "Mars"])
    styles: list[str] = Field(default_factory=lambda: ["calm", "cinematic"])
    seeds: list[int] = Field(default_factory=lambda: [7, 13, 19])
    days: int = Field(default=30, ge=7, le=120)
    alpha: float = Field(default=0.05, ge=0.001, le=0.5)


@app.get("/evaluation/latest")
def evaluation_latest():
    """Return the most recent persisted evaluation JSON (from docs/)."""
    if not EVAL_REPORT_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="No persisted evaluation. Run scripts/evaluate_baseline_vs_ai.py first.",
        )
    import json as _json

    try:
        data = _json.loads(EVAL_REPORT_PATH.read_text(encoding="utf-8"))
    except (OSError, _json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read report: {exc}") from exc
    data["report_path"] = str(EVAL_REPORT_PATH.name)
    data["report_mtime"] = EVAL_REPORT_PATH.stat().st_mtime
    return data


@app.post("/evaluation/run")
async def evaluation_run(req: EvaluationRequest):
    # Strict whitelisting of grid values — the script is reachable from a
    # public endpoint so we never blindly trust user-supplied planet/style
    # strings that ultimately reach disk caches and FluidSynth.
    planets = [p for p in req.planets if p in EVAL_VALID_PLANETS]
    styles = [s for s in req.styles if s in EVAL_VALID_STYLES]
    seeds = [int(s) for s in req.seeds if 0 <= int(s) <= 2_000_000_000]
    if not planets:
        raise HTTPException(status_code=400, detail="planets list is empty / invalid")
    if not styles:
        raise HTTPException(status_code=400, detail="styles list is empty / invalid")
    if not seeds:
        raise HTTPException(status_code=400, detail="seeds list is empty / invalid")
    total = len(planets) * len(styles) * len(seeds)
    if total > EVAL_MAX_PAIRS:
        raise HTTPException(
            status_code=400,
            detail=f"grid size {total} > max {EVAL_MAX_PAIRS}; use the CLI for larger runs",
        )

    cells = [(p, s, seed) for p in planets for s in styles for seed in seeds]

    def _run_all():
        from dataclasses import asdict as _asdict

        pairs = [
            _eval_run_pair(settings, p, s, seed, req.days) for (p, s, seed) in cells
        ]
        reports = aggregate_reports(pairs, alpha=req.alpha)
        return {
            "config": {
                "planets": planets,
                "styles": styles,
                "seeds": seeds,
                "days": req.days,
                "alpha": req.alpha,
            },
            "pairs": [_asdict(p) for p in pairs],
            "reports": [_asdict(r) for r in reports],
        }

    try:
        return await asyncio.to_thread(_run_all)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("/evaluation/run failed", extra={"request_id": "-"})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# WebSocket — hardened live stream
# ---------------------------------------------------------------------------
_LIVE_SESSIONS_LOCK = asyncio.Lock()
_LIVE_SESSIONS = 0


async def _acquire_session_slot() -> bool:
    global _LIVE_SESSIONS
    async with _LIVE_SESSIONS_LOCK:
        if _LIVE_SESSIONS >= MAX_LIVE_SESSIONS:
            return False
        _LIVE_SESSIONS += 1
        return True


async def _release_session_slot() -> None:
    global _LIVE_SESSIONS
    async with _LIVE_SESSIONS_LOCK:
        _LIVE_SESSIONS = max(0, _LIVE_SESSIONS - 1)


async def _send_heartbeats(ws: WebSocket, sid: str) -> None:
    try:
        while True:
            await asyncio.sleep(LIVE_WS_HEARTBEAT_SEC)
            await ws.send_json({"type": "ping", "sid": sid, "ts": time.time()})
    except Exception:
        return


@app.websocket("/live/ws")
async def live_ws(
    websocket: WebSocket,
    planet: str = Query("Mars", pattern=PLANET_NAME_RE),
    days: int = Query(60, ge=7, le=365),
    seed: int = Query(42, ge=0, le=2_000_000_000),
    interval_ms: int = Query(350, ge=50, le=2000),
    mode: Literal["baseline", "ai"] = Query("ai"),
    style: Literal["calm", "pop", "study", "cinematic", "drone"] = Query("calm"),
    use_lstm: bool = Query(False),
    lstm_temperature: float = Query(0.92, ge=0.1, le=1.8),
):
    sid = uuid.uuid4().hex[:10]
    if not await _acquire_session_slot():
        await websocket.accept()
        await websocket.send_json(
            {"type": "error", "code": "busy", "message": "Server busy. Try again later."}
        )
        await websocket.close(code=1013)
        logger.warning("WS rejected (cap reached) sid=%s", sid, extra={"request_id": sid})
        return

    await websocket.accept()
    logger.info(
        "WS opened sid=%s planet=%s days=%d mode=%s style=%s interval_ms=%d",
        sid,
        planet,
        days,
        mode,
        style,
        interval_ms,
        extra={"request_id": sid},
    )
    heartbeat_task: Optional[asyncio.Task[None]] = None
    try:
        ckpt = _server_lstm_checkpoint(use_lstm) if mode == "ai" else None
        dataset, events = await asyncio.to_thread(
            build_live_event_stream,
            planet,
            days,
            seed,
            mode,
            style,
            ckpt,
            "cpu",
            lstm_temperature,
            settings.data_dir,
        )
        await websocket.send_json(
            {
                "type": "session_start",
                "sid": sid,
                "planet": planet,
                "style": style,
                "count": len(events),
                "metadata": dataset.get("metadata", {}),
            }
        )
        heartbeat_task = asyncio.create_task(_send_heartbeats(websocket, sid))
        for idx, ev in enumerate(events):
            await websocket.send_json(
                {"type": "note_event", "index": idx, "total": len(events), "event": ev}
            )
            await asyncio.sleep(max(interval_ms, 50) / 1000.0)
        await websocket.send_json({"type": "session_end", "sid": sid, "planet": planet})
    except WebSocketDisconnect:
        logger.info("WS disconnect sid=%s", sid, extra={"request_id": sid})
    except Exception as exc:
        logger.exception("WS error sid=%s", sid, extra={"request_id": sid})
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        if heartbeat_task is not None:
            heartbeat_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
        await _release_session_slot()
        logger.info("WS closed sid=%s", sid, extra={"request_id": sid})
