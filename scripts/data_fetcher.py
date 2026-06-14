import json
import logging
import math
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple

import requests

PLANET_IDS = {
    "Mercury": "199",
    "Venus": "299",
    "Earth": "399",
    "Mars": "499",
    "Jupiter": "599",
    "Saturn": "699",
    "Uranus": "799",
    "Neptune": "899",
}

# ترتيب ثابت لسطر الأوامر والنوتبوك (تصدير/تدريب يشمل كل الكواكب)
ALL_PLANETS = tuple(PLANET_IDS.keys())

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
logger = logging.getLogger(__name__)


class DataFetchError(Exception):
    pass


class DataValidationError(Exception):
    pass


def _build_date_range(days_count=30):
    if days_count < 1:
        raise DataValidationError("days_count must be >= 1")
    start_dt = datetime.now(timezone.utc).date()
    end_dt = start_dt + timedelta(days=days_count)
    return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")


# Horizons accepts a bare integer for STEP_SIZE which is interpreted as
# "split the START_TIME..STOP_TIME window into N equal intervals" (yielding
# N+1 ephemeris points). We use this when sampling very wide windows
# (years to decades) for the birthday feature, where a literal "1d" step
# would return tens of thousands of points and exhaust the API quota.
_MIN_HORIZONS_DATE = "1900-01-01"


def _extract_vectors(result_text):
    x_list = re.findall(r"\bX\s*=\s*([\d.E+-]+)", result_text)
    y_list = re.findall(r"\bY\s*=\s*([\d.E+-]+)", result_text)
    z_list = re.findall(r"\bZ\s*=\s*([\d.E+-]+)", result_text)
    vx_list = re.findall(r"VX\s*=\s*([\d.E+-]+)", result_text)
    vy_list = re.findall(r"VY\s*=\s*([\d.E+-]+)", result_text)
    vz_list = re.findall(r"VZ\s*=\s*([\d.E+-]+)", result_text)
    date_list = re.findall(r"A\.\s*D\.\s*(\d{4}-[A-Za-z]{3}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)", result_text)

    count = min(len(x_list), len(y_list), len(z_list), len(vx_list), len(vy_list), len(vz_list))
    if count == 0:
        raise DataValidationError("No state vectors (position/velocity) were extracted from NASA response.")

    points = []
    prev_speed = None
    for i in range(count):
        x = float(x_list[i])
        y = float(y_list[i])
        z = float(z_list[i])
        vx = float(vx_list[i])
        vy = float(vy_list[i])
        vz = float(vz_list[i])
        radius = (x * x + y * y + z * z) ** 0.5
        speed = (vx * vx + vy * vy + vz * vz) ** 0.5
        radial_velocity = 0.0 if radius == 0 else ((x * vx) + (y * vy) + (z * vz)) / radius
        light_intensity_proxy = 1.0 / max(radius * radius, 1e-12)
        heading_xy = math.atan2(y, x)
        heading_z = math.atan2(z, max((x * x + y * y) ** 0.5, 1e-12))
        speed_delta = 0.0 if prev_speed is None else speed - prev_speed
        prev_speed = speed

        points.append(
            {
                "index": i,
                "date": date_list[i] if i < len(date_list) else None,
                "x": x,
                "y": y,
                "z": z,
                "vx": vx,
                "vy": vy,
                "vz": vz,
                "speed": abs(speed),
                "radius": radius,
                "radial_velocity": radial_velocity,
                "light_intensity_proxy": light_intensity_proxy,
                "heading_xy": heading_xy,
                "heading_z": heading_z,
                "speed_delta": speed_delta,
            }
        )
    return points


def _build_horizons_params(target, start_date, end_date, step_size: str = "1d"):
    return {
        "format": "json",
        "COMMAND": f"'{target}'",
        "OBJ_DATA": "YES",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTORS",
        "CENTER": "500@10",
        "STEP_SIZE": step_size,
        "START_TIME": start_date,
        "STOP_TIME": end_date,
    }


def _request_horizons(params, timeout: float = 45.0, attempts: int = 3, backoff_sec: float = 1.6):
    """Single Horizons call with exponential-backoff retry on transient failures.

    Horizons can return a `signal` or `error` field even on HTTP 200 — those
    are surfaced as `DataValidationError` (do NOT retry) instead of being
    swallowed silently.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(HORIZONS_URL, params=params, timeout=timeout)
            response.raise_for_status()
            payload = response.json()
        except requests.Timeout as exc:
            last_exc = exc
            logger.warning("Horizons timeout (attempt %d/%d): %s", attempt, attempts, exc)
        except requests.HTTPError as exc:
            # 4xx are caller errors; do not retry.
            if 400 <= (exc.response.status_code if exc.response is not None else 0) < 500:
                raise DataFetchError(f"NASA HTTP {exc.response.status_code}: {exc}") from exc
            last_exc = exc
            logger.warning("Horizons HTTP error (attempt %d/%d): %s", attempt, attempts, exc)
        except requests.RequestException as exc:
            last_exc = exc
            logger.warning("Horizons connection error (attempt %d/%d): %s", attempt, attempts, exc)
        except ValueError as exc:
            raise DataFetchError("NASA response is not valid JSON.") from exc
        else:
            # Some Horizons errors come back inside the JSON body.
            signal = (payload.get("signal") or "").strip().lower()
            error_field = payload.get("error") or ""
            result_text = payload.get("result", "")
            if signal in {"error", "bad request"} or error_field:
                raise DataValidationError(
                    f"NASA Horizons rejected request: {error_field or signal or 'unknown'}"
                )
            if not result_text:
                raise DataValidationError("NASA response does not contain 'result' content.")
            return result_text
        # Retryable path
        if attempt < attempts:
            time.sleep(backoff_sec * (2 ** (attempt - 1)))
    raise DataFetchError(f"NASA request failed after {attempts} attempts: {last_exc}")


def _resolve_target(planet_name):
    if not planet_name:
        raise DataValidationError("planet_name is required.")
    return PLANET_IDS.get(planet_name.capitalize(), planet_name)


def get_planet_velocity_sequence(planet_name="Mars", days_count=30):
    target = PLANET_IDS.get(planet_name.capitalize(), planet_name)
    start_date, end_date = _build_date_range(days_count=days_count)
    params = _build_horizons_params(target, start_date, end_date)
    result_text = _request_horizons(params)
    points = _extract_vectors(result_text)
    return [p["speed"] for p in points]


def fetch_velocity_dataset(planet_name="Mars", days_count=30):
    target = _resolve_target(planet_name)
    start_date, end_date = _build_date_range(days_count=days_count)
    params = _build_horizons_params(target, start_date, end_date)
    result_text = _request_horizons(params)
    points = _extract_vectors(result_text)
    speeds = [p["speed"] for p in points]
    speed_min = min(speeds)
    speed_max = max(speeds)
    speed_avg = sum(speeds) / len(speeds)

    dataset = {
        "metadata": {
            "source": "NASA Horizons API",
            "url": HORIZONS_URL,
            "fetched_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "request_params": params,
            "parse_stats": {
                "points_count": len(points),
                "speed_min": speed_min,
                "speed_max": speed_max,
                "speed_avg": speed_avg,
            },
        },
        "planet": planet_name,
        "target": target,
        "start_date": start_date,
        "end_date": end_date,
        "count": len(points),
        "points": points,
    }
    logger.info(
        "Fetched NASA vectors for %s: %s points (%s -> %s)",
        planet_name,
        len(points),
        start_date,
        end_date,
    )
    return dataset


def save_velocity_dataset(dataset, data_dir="data"):
    os.makedirs(data_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    planet = dataset.get("planet", "planet")
    path = os.path.join(data_dir, f"{planet.lower()}_{stamp}.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(dataset, fp, indent=2)
    return path


# ---------------------------------------------------------------------------
# Caching layer
# ---------------------------------------------------------------------------
# Horizons returns the same vectors for the same UTC day, planet, and window.
# The cache key includes the UTC date so a new day automatically invalidates
# yesterday's data, while protecting NASA from repeated identical calls within
# the same day.

_CACHE_TTL_SEC_DEFAULT = 6 * 3600


def _cache_dir(base: str = "data") -> Path:
    p = Path(base) / "cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _cache_filename(planet: str, days: int) -> str:
    safe = re.sub(r"[^A-Za-z0-9]", "_", planet.lower())[:32]
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{safe}_{today}_d{int(days):03d}.json"


def _validate_iso_date(value: str, field: str) -> str:
    """Parse a YYYY-MM-DD date and reject anything Horizons cannot serve."""
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise DataValidationError(f"{field} must be YYYY-MM-DD, got {value!r}") from exc
    floor = datetime.strptime(_MIN_HORIZONS_DATE, "%Y-%m-%d").date()
    if parsed < floor:
        raise DataValidationError(
            f"{field}={value} is before {_MIN_HORIZONS_DATE} (Horizons floor)"
        )
    if parsed > datetime.now(timezone.utc).date():
        raise DataValidationError(f"{field}={value} is in the future")
    return parsed.strftime("%Y-%m-%d")


def fetch_velocity_dataset_range(
    planet_name: str,
    start_date: str,
    end_date: str,
    samples: int = 60,
) -> dict:
    """Fetch a sampled NASA Horizons window between two arbitrary dates.

    Unlike `fetch_velocity_dataset`, this asks Horizons for exactly
    `samples` ephemeris intervals across the window so wide ranges
    (years → decades, e.g. birthday-to-today) stay bounded in size.
    The returned shape matches `fetch_velocity_dataset` so the rest of
    the pipeline (sonifier, harmony engine) is unchanged.
    """
    if samples < 8:
        raise DataValidationError("samples must be >= 8 to make a usable melody")
    if samples > 360:
        raise DataValidationError("samples must be <= 360 (Horizons response size)")
    start = _validate_iso_date(start_date, "start_date")
    end = _validate_iso_date(end_date, "end_date")
    if start >= end:
        raise DataValidationError("start_date must be strictly before end_date")
    target = _resolve_target(planet_name)
    params = _build_horizons_params(target, start, end, step_size=str(int(samples)))
    result_text = _request_horizons(params)
    points = _extract_vectors(result_text)
    speeds = [p["speed"] for p in points]
    dataset = {
        "metadata": {
            "source": "NASA Horizons API",
            "url": HORIZONS_URL,
            "fetched_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "request_params": params,
            "parse_stats": {
                "points_count": len(points),
                "speed_min": min(speeds) if speeds else 0.0,
                "speed_max": max(speeds) if speeds else 0.0,
                "speed_avg": (sum(speeds) / len(speeds)) if speeds else 0.0,
            },
            "sampling": {
                "mode": "range",
                "start_date": start,
                "end_date": end,
                "samples_requested": samples,
            },
        },
        "planet": planet_name,
        "target": target,
        "start_date": start,
        "end_date": end,
        "count": len(points),
        "points": points,
    }
    logger.info(
        "Fetched NASA range for %s: %s points (%s -> %s, samples=%d)",
        planet_name,
        len(points),
        start,
        end,
        samples,
    )
    return dataset


def fetch_or_load_dataset_range(
    planet_name: str,
    start_date: str,
    end_date: str,
    samples: int = 60,
    data_dir: str = "data",
    ttl_sec: int = _CACHE_TTL_SEC_DEFAULT,
) -> Tuple[dict, str, bool]:
    """Cached variant of `fetch_velocity_dataset_range`.

    Cache key combines planet, start, end and sample count so two gift
    requests for the same recipient share a single Horizons call.
    """
    start = _validate_iso_date(start_date, "start_date")
    end = _validate_iso_date(end_date, "end_date")
    cache_dir = _cache_dir(data_dir)
    safe = re.sub(r"[^A-Za-z0-9]", "_", planet_name.lower())[:32]
    cache_name = f"{safe}_range_{start}_{end}_s{int(samples):03d}.json"
    cache_path = cache_dir / cache_name
    if cache_path.is_file():
        try:
            age = time.time() - cache_path.stat().st_mtime
            if age < ttl_sec:
                data = json.loads(cache_path.read_text(encoding="utf-8"))
                if data and isinstance(data, dict) and data.get("points"):
                    logger.info(
                        "NASA range cache hit %s (age=%.0fs, file=%s)",
                        planet_name,
                        age,
                        cache_path.name,
                    )
                    return data, str(cache_path), True
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Stale/invalid range cache %s: %s", cache_path, exc)
    dataset = fetch_velocity_dataset_range(planet_name, start, end, samples=samples)
    try:
        cache_path.write_text(json.dumps(dataset), encoding="utf-8")
    except OSError as exc:
        logger.warning("Could not write NASA range cache: %s", exc)
    return dataset, str(cache_path), False


def fetch_or_load_dataset(
    planet_name: str = "Mars",
    days_count: int = 30,
    data_dir: str = "data",
    ttl_sec: int = _CACHE_TTL_SEC_DEFAULT,
) -> Tuple[dict, str, bool]:
    """Return (dataset, file_path, served_from_cache).

    The file path is the canonical on-disk JSON for this (planet, days, UTC day).
    Subsequent calls within `ttl_sec` reuse the cached file instead of hitting
    Horizons.
    """
    cache_dir = _cache_dir(data_dir)
    cache_path = cache_dir / _cache_filename(planet_name, days_count)
    if cache_path.is_file():
        try:
            age = time.time() - cache_path.stat().st_mtime
            if age < ttl_sec:
                data = json.loads(cache_path.read_text(encoding="utf-8"))
                if data and isinstance(data, dict) and data.get("points"):
                    logger.info(
                        "NASA cache hit %s (age=%.0fs, file=%s)",
                        planet_name,
                        age,
                        cache_path.name,
                    )
                    return data, str(cache_path), True
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Stale/invalid cache file %s: %s", cache_path, exc)
    dataset = fetch_velocity_dataset(planet_name, days_count)
    try:
        cache_path.write_text(json.dumps(dataset), encoding="utf-8")
    except OSError as exc:
        logger.warning("Could not write NASA cache: %s", exc)
    return dataset, str(cache_path), False


def cleanup_outputs(
    outputs_dir: str,
    max_age_sec: int = 24 * 3600,
    exclude_substrings: Tuple[str, ...] = ("_birthday_", "birthday_"),
) -> int:
    """Delete files in `outputs_dir` older than `max_age_sec`.

    Files whose name contains any of `exclude_substrings` are preserved
    regardless of age — this is how we keep birthday-gift audio reachable
    long after the 24h studio retention window.

    Returns the number of files removed. Safe to call at startup and on a
    cron-like schedule.
    """
    out = Path(outputs_dir)
    if not out.is_dir():
        return 0
    now = time.time()
    removed = 0
    for f in out.iterdir():
        if not f.is_file():
            continue
        name = f.name
        if any(s in name for s in exclude_substrings):
            continue
        try:
            if now - f.stat().st_mtime > max_age_sec:
                f.unlink()
                removed += 1
        except OSError as exc:
            logger.warning("Could not remove old artifact %s: %s", f, exc)
    if removed:
        logger.info("Outputs retention: removed %d old files from %s", removed, outputs_dir)
    return removed