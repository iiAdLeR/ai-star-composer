"""
Real-data backing for the Artemis I visualization.

Strategy
--------
JPL Horizons does **not** expose the Orion spacecraft trajectory through its
public API in a stable way, so we anchor the rocket animation to something
that *is* in Horizons: **the Moon's actual position relative to Earth on each
day of the Artemis I mission window (2022-11-16 → 2022-12-11)**.

The endpoint returns:
- The real Earth→Moon distance per day.
- A daily Moon position vector (Earth-centered) in km.
- A normalized parametric path (Earth → DRO → Moon → return) that the
  frontend can scrub through.

That way the rocket *isn't* fully synthetic: every key anchor point is real
ephemeris from NASA JPL. The trajectory in between is interpolated, which is
honest to describe to a thesis committee.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("ai_star_composer.mission")

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE_DIR = Path("data/missions").resolve()
CACHE_DIR.mkdir(parents=True, exist_ok=True)

ARTEMIS_I_INFO: Dict[str, Any] = {
    "id": "artemis_i",
    "mission": "Artemis I",
    "agency": "NASA",
    "vehicle": "SLS Block 1 / Orion (uncrewed)",
    "launchDate": "2022-11-16T06:47:44Z",
    "splashdown": "2022-12-11T17:40:00Z",
    "target": "Distant Retrograde Orbit around the Moon",
    "status": "Completed",
    "source": "https://www.nasa.gov/artemis-1/",
    "window": {"start": "2022-11-16", "end": "2022-12-11"},
}


@dataclass(frozen=True)
class HorizonsConfig:
    target: str
    center: str
    start: str
    end: str
    step: str = "1d"


def _cache_key(cfg: HorizonsConfig) -> Path:
    safe = f"{cfg.target}_{cfg.center}_{cfg.start}_{cfg.end}_{cfg.step}".replace("@", "at")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", safe)
    return CACHE_DIR / f"{safe}.json"


def _request_horizons(cfg: HorizonsConfig, timeout: float = 30.0) -> str:
    params = {
        "format": "json",
        "COMMAND": f"'{cfg.target}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTORS",
        "CENTER": f"'{cfg.center}'",
        "STEP_SIZE": cfg.step,
        "START_TIME": cfg.start,
        "STOP_TIME": cfg.end,
    }
    r = requests.get(HORIZONS_URL, params=params, timeout=timeout)
    r.raise_for_status()
    payload = r.json()
    result = payload.get("result", "")
    if not result:
        raise RuntimeError("Empty Horizons result.")
    return result


# Horizons vector block lines look like:  X = 1.234E+05 Y =-3.45E+05 Z = 6.7E+02
_FLOAT = r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?"


def _parse_vectors(text: str) -> List[Dict[str, float]]:
    """Pull (date, X, Y, Z) tuples in km out of a Horizons VECTORS payload."""
    rows: List[Dict[str, float]] = []
    # Each ephemeris record starts with a Julian date and a calendar timestamp.
    block_re = re.compile(
        r"(?P<jd>\d{7}\.\d+)\s*=\s*A\.D\.\s*"
        r"(?P<date>\d{4}-[A-Za-z]{3}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s*TDB.*?"
        rf"X\s*=\s*(?P<x>{_FLOAT}).*?"
        rf"Y\s*=\s*(?P<y>{_FLOAT}).*?"
        rf"Z\s*=\s*(?P<z>{_FLOAT})",
        re.DOTALL,
    )
    for m in block_re.finditer(text):
        rows.append(
            {
                "jd": float(m.group("jd")),
                "date": m.group("date"),
                "x_km": float(m.group("x")),
                "y_km": float(m.group("y")),
                "z_km": float(m.group("z")),
            }
        )
    return rows


def fetch_horizons_vectors(cfg: HorizonsConfig, ttl_sec: int = 6 * 3600) -> List[Dict[str, float]]:
    """Cached Horizons VECTORS query. Returns parsed (km) waypoints."""
    cache = _cache_key(cfg)
    if cache.is_file():
        try:
            age = time.time() - cache.stat().st_mtime
            if age < ttl_sec:
                data = json.loads(cache.read_text(encoding="utf-8"))
                if data and isinstance(data, list):
                    return data
        except (OSError, json.JSONDecodeError):
            pass
    text = _request_horizons(cfg)
    rows = _parse_vectors(text)
    if not rows:
        raise RuntimeError("Failed to parse Horizons vectors.")
    try:
        cache.write_text(json.dumps(rows), encoding="utf-8")
    except OSError as exc:
        logger.warning("Could not write Horizons cache: %s", exc)
    return rows


# ---------------------------------------------------------------------------
# Artemis I — build the rocket waypoints from real Moon ephemeris.
# ---------------------------------------------------------------------------
def _normalize_xyz(km: List[Dict[str, float]]) -> List[Dict[str, float]]:
    """Map kilometers to a unit-ish frame for the 3D scene.

    The frontend scene radius is around 2–5 units. We scale by the *median*
    Earth-Moon distance during the mission so the visualization stays inside
    a sensible box no matter which day we look at.
    """
    if not km:
        return []
    dists = [math.sqrt(p["x_km"] ** 2 + p["y_km"] ** 2 + p["z_km"] ** 2) for p in km]
    ref = max(1.0, sorted(dists)[len(dists) // 2])
    out: List[Dict[str, float]] = []
    for p in km:
        out.append(
            {
                "date": p["date"],
                "jd": p["jd"],
                "distance_km": math.sqrt(p["x_km"] ** 2 + p["y_km"] ** 2 + p["z_km"] ** 2),
                "x": p["x_km"] / ref,
                "y": p["y_km"] / ref,
                "z": p["z_km"] / ref,
            }
        )
    return out


def _build_rocket_path(moon_points: List[Dict[str, float]]) -> List[Dict[str, Any]]:
    """Build a phased Earth → DRO → splashdown path.

    Phases follow Artemis I's actual mission profile:
      0.00–0.18  Translunar Injection burn out of Earth orbit.
      0.18–0.40  Outbound coast — rocket leans toward the Moon's position.
      0.40–0.60  Distant Retrograde Orbit — small loop offset from the Moon.
      0.60–0.85  Return trajectory.
      0.85–1.00  Re-entry / splashdown.
    Each waypoint t in [0,1] is anchored to a real Moon position by index.
    """
    if not moon_points:
        return []
    n = len(moon_points)
    waypoints: List[Dict[str, Any]] = []
    for i, m in enumerate(moon_points):
        t = i / max(1, n - 1)
        if t < 0.18:
            # Earth departure: lift off the Earth surface toward the Moon vector.
            k = t / 0.18
            rocket = {
                "x": m["x"] * (0.05 + 0.55 * k),
                "y": m["y"] * (0.05 + 0.55 * k) + 0.08 * math.sin(k * math.pi),
                "z": m["z"] * (0.05 + 0.55 * k),
            }
            phase = "trans_lunar_injection"
        elif t < 0.40:
            k = (t - 0.18) / 0.22
            rocket = {
                "x": m["x"] * (0.60 + 0.40 * k),
                "y": m["y"] * (0.60 + 0.40 * k) + 0.05 * math.cos(k * math.pi),
                "z": m["z"] * (0.60 + 0.40 * k),
            }
            phase = "outbound_coast"
        elif t < 0.60:
            # Distant Retrograde Orbit: small ellipse offset from the Moon.
            k = (t - 0.40) / 0.20
            angle = k * 2.0 * math.pi
            offset_r = 0.18
            rocket = {
                "x": m["x"] + offset_r * math.cos(angle),
                "y": m["y"] + offset_r * math.sin(angle) * 0.45,
                "z": m["z"] + offset_r * math.sin(angle) * 0.2,
            }
            phase = "distant_retrograde_orbit"
        elif t < 0.85:
            k = (t - 0.60) / 0.25
            rocket = {
                "x": m["x"] * (1.0 - 0.95 * k),
                "y": m["y"] * (1.0 - 0.95 * k) - 0.05 * math.sin(k * math.pi),
                "z": m["z"] * (1.0 - 0.95 * k),
            }
            phase = "return_coast"
        else:
            k = (t - 0.85) / 0.15
            rocket = {
                "x": m["x"] * 0.05 * (1.0 - k),
                "y": m["y"] * 0.05 * (1.0 - k),
                "z": m["z"] * 0.05 * (1.0 - k),
            }
            phase = "reentry_splashdown"
        waypoints.append(
            {
                "t": round(t, 4),
                "date": m["date"],
                "phase": phase,
                "moon": {"x": m["x"], "y": m["y"], "z": m["z"]},
                "moon_distance_km": m["distance_km"],
                "rocket": {
                    "x": round(rocket["x"], 5),
                    "y": round(rocket["y"], 5),
                    "z": round(rocket["z"], 5),
                },
            }
        )
    return waypoints


def get_artemis_i_trajectory() -> Dict[str, Any]:
    """Public entry-point used by the FastAPI endpoint."""
    cfg = HorizonsConfig(
        target="301",   # Moon
        center="500@399",  # Earth geocentre
        start="2022-11-16",
        end="2022-12-12",
    )
    try:
        raw = fetch_horizons_vectors(cfg)
        moon = _normalize_xyz(raw)
        waypoints = _build_rocket_path(moon)
        if not waypoints:
            raise RuntimeError("No waypoints produced.")
        source = "horizons"
    except Exception as exc:
        logger.warning("Horizons fetch for Artemis I failed: %s — using offline fallback", exc)
        moon = _offline_moon_fallback()
        waypoints = _build_rocket_path(moon)
        source = "offline_fallback"
    return {
        "mission": ARTEMIS_I_INFO,
        "source": source,
        "moon_anchor_count": len(waypoints),
        "waypoints": waypoints,
    }


def _offline_moon_fallback() -> List[Dict[str, float]]:
    """Deterministic fallback so the page works without internet.

    Generates 26 daily points along a slightly elliptical Earth-Moon orbit
    (semi-major ≈ 384 400 km). Clearly labelled in the response payload via
    `source = "offline_fallback"`.
    """
    points: List[Dict[str, float]] = []
    a_km = 384_400.0
    e = 0.0549
    for i in range(26):
        mean_anomaly = (i / 27.3) * 2.0 * math.pi
        r = a_km * (1 - e * math.cos(mean_anomaly))
        x = r * math.cos(mean_anomaly)
        y = r * math.sin(mean_anomaly) * 0.92
        z = r * math.sin(mean_anomaly) * 0.05
        points.append(
            {
                "date": f"offline-day-{i:02d}",
                "jd": 2459899.5 + i,
                "distance_km": r,
                "x": x / a_km,
                "y": y / a_km,
                "z": z / a_km,
            }
        )
    return points


# Optional: lightweight historical mission list (curated, citation-ready).
HISTORIC_MISSIONS: List[Dict[str, Any]] = [
    {
        "id": "sputnik_1",
        "mission": "Sputnik 1",
        "agency": "USSR",
        "vehicle": "R-7 Semyorka",
        "launchDate": "1957-10-04T19:28:34Z",
        "endDate": "1958-01-04T00:00:00Z",
        "target": "Low Earth orbit",
        "status": "Completed",
        "summary": "The first artificial satellite. A 58 cm aluminum sphere with four radio antennas, audible worldwide on shortwave for 22 days.",
        "impact": "Started the Space Race and the entire field of practical spaceflight.",
        "source": "https://history.nasa.gov/sputnik.html",
        "category": "first",
        "primary_target": "Earth",
    },
    {
        "id": "yuri_gagarin",
        "mission": "Vostok 1 — Yuri Gagarin",
        "agency": "USSR",
        "vehicle": "Vostok-K",
        "launchDate": "1961-04-12T06:07:00Z",
        "endDate": "1961-04-12T07:55:00Z",
        "target": "Low Earth orbit",
        "status": "Completed — first human in space",
        "summary": "Single 108-minute orbit of Earth by Cosmonaut Yuri Gagarin — humanity's first journey beyond the atmosphere.",
        "impact": "Demonstrated humans could survive launch, weightlessness and re-entry.",
        "source": "https://www.nasa.gov/feature/gagarin-50-years-ago",
        "category": "first",
        "primary_target": "Earth",
    },
    {
        "id": "apollo_8",
        "mission": "Apollo 8",
        "agency": "NASA",
        "vehicle": "Saturn V / Apollo CSM",
        "launchDate": "1968-12-21T12:51:00Z",
        "endDate": "1968-12-27T15:51:42Z",
        "target": "Lunar orbit",
        "status": "Completed — first crewed lunar orbit",
        "summary": "First humans to leave low Earth orbit, the first to see the far side of the Moon, and the first to take the Earthrise photograph.",
        "impact": "Proved the trans-lunar trajectory and gave humanity its first 'planet portrait' photo.",
        "source": "https://www.nasa.gov/mission_pages/apollo/missions/apollo8.html",
        "category": "lunar",
        "primary_target": "Earth",
    },
    {
        "id": "apollo_11",
        "mission": "Apollo 11",
        "agency": "NASA",
        "vehicle": "Saturn V / Apollo CSM+LM",
        "launchDate": "1969-07-16T13:32:00Z",
        "endDate": "1969-07-24T16:50:35Z",
        "target": "Lunar surface (Sea of Tranquillity)",
        "status": "Completed — first crewed Moon landing",
        "summary": "Neil Armstrong and Buzz Aldrin became the first humans to walk on another world; Michael Collins orbited above.",
        "impact": "Fulfilled the 1961 Kennedy goal and showed crewed planetary exploration was possible.",
        "source": "https://www.nasa.gov/mission_pages/apollo/missions/apollo11.html",
        "category": "lunar",
        "primary_target": "Earth",
    },
    {
        "id": "pioneer_10",
        "mission": "Pioneer 10",
        "agency": "NASA",
        "vehicle": "Atlas-Centaur",
        "launchDate": "1972-03-03T01:49:00Z",
        "endDate": "2003-01-23T00:00:00Z",
        "target": "Jupiter flyby",
        "status": "Mission ended 2003 — first spacecraft beyond Pluto's orbit",
        "summary": "First spacecraft to traverse the asteroid belt and reach Jupiter. Carried the famous Pioneer plaque message to extraterrestrials.",
        "impact": "Showed the asteroid belt was not a fatal hazard and opened outer-planet exploration.",
        "source": "https://science.nasa.gov/mission/pioneer-10/",
        "category": "deep-space",
        "primary_target": "Jupiter",
    },
    {
        "id": "voyager_1",
        "mission": "Voyager 1",
        "agency": "NASA / JPL",
        "vehicle": "Titan IIIE-Centaur",
        "launchDate": "1977-09-05T12:56:00Z",
        "target": "Outer planets → interstellar space",
        "status": "Active (interstellar medium since 2012)",
        "summary": "Visited Jupiter (1979) and Saturn (1980), then continued outward. Crossed the heliopause in August 2012 — the first human-made object in interstellar space.",
        "impact": "Carries the Golden Record — humanity's message to the cosmos.",
        "source": "https://voyager.jpl.nasa.gov/",
        "category": "deep-space",
        "primary_target": "Jupiter",
    },
    {
        "id": "voyager_2",
        "mission": "Voyager 2",
        "agency": "NASA / JPL",
        "vehicle": "Titan IIIE-Centaur",
        "launchDate": "1977-08-20T14:29:00Z",
        "target": "All four giant planets",
        "status": "Active (interstellar medium since 2018)",
        "summary": "The only spacecraft ever to fly past Uranus (1986) and Neptune (1989). Discovered 16 new moons and 2 new rings in those flybys.",
        "impact": "Our entire close-up knowledge of Uranus and Neptune still comes from this single mission.",
        "source": "https://voyager.jpl.nasa.gov/",
        "category": "deep-space",
        "primary_target": "Neptune",
    },
    {
        "id": "hubble",
        "mission": "Hubble Space Telescope",
        "agency": "NASA / ESA",
        "vehicle": "Space Shuttle Discovery (STS-31)",
        "launchDate": "1990-04-24T12:33:51Z",
        "target": "Low Earth orbit observatory",
        "status": "Active (over 35 years)",
        "summary": "The first major optical telescope in space. After 1993's servicing mission corrected its mirror, it transformed cosmology, exoplanet science and public imagination.",
        "impact": "1.5 million observations; supports virtually every active astrophysicist's research.",
        "source": "https://science.nasa.gov/mission/hubble/",
        "category": "telescope",
        "primary_target": "Earth",
    },
    {
        "id": "iss",
        "mission": "International Space Station",
        "agency": "NASA / Roscosmos / ESA / JAXA / CSA",
        "vehicle": "Multiple launches since 1998",
        "launchDate": "1998-11-20T06:40:00Z",
        "target": "Low Earth orbit (continuous human presence)",
        "status": "Active — continuously crewed since November 2000",
        "summary": "Modular orbital laboratory. The largest peacetime international engineering project in human history.",
        "impact": "Continuous human presence in space for 25+ years; biological & materials research.",
        "source": "https://www.nasa.gov/international-space-station/",
        "category": "station",
        "primary_target": "Earth",
    },
    {
        "id": "cassini",
        "mission": "Cassini–Huygens",
        "agency": "NASA / ESA / ASI",
        "vehicle": "Titan IVB-Centaur",
        "launchDate": "1997-10-15T08:43:00Z",
        "endDate": "2017-09-15T11:55:46Z",
        "target": "Saturn system",
        "status": "Completed — Grand Finale dive into Saturn",
        "summary": "13 years orbiting Saturn. Deployed the Huygens probe to Titan — the only landing in the outer solar system.",
        "impact": "Discovered active geysers on Enceladus, methane lakes on Titan, and revolutionized understanding of ring dynamics.",
        "source": "https://science.nasa.gov/mission/cassini/",
        "category": "planetary",
        "primary_target": "Saturn",
    },
    {
        "id": "perseverance",
        "mission": "Mars 2020 / Perseverance",
        "agency": "NASA",
        "vehicle": "Atlas V 541",
        "launchDate": "2020-07-30T11:50:00Z",
        "target": "Jezero Crater, Mars",
        "status": "Active",
        "summary": "Searching for signs of ancient microbial life. Caching samples for return by a future mission. Carries the Ingenuity helicopter — the first powered flight on another planet.",
        "impact": "Most advanced astrobiology rover yet; samples will return to Earth in the 2030s.",
        "source": "https://mars.nasa.gov/mars2020/",
        "category": "planetary",
        "primary_target": "Mars",
    },
    {
        "id": "jwst",
        "mission": "James Webb Space Telescope",
        "agency": "NASA / ESA / CSA",
        "vehicle": "Ariane 5 ECA",
        "launchDate": "2021-12-25T12:20:00Z",
        "target": "Sun-Earth L2 (1.5 million km from Earth)",
        "status": "Active",
        "summary": "6.5 m segmented infrared telescope, 100× more powerful than Hubble for some observations.",
        "impact": "First operational year resolved the deepest infrared image of the universe and observed atmospheres of exoplanets.",
        "source": "https://science.nasa.gov/mission/webb/",
        "category": "telescope",
        "primary_target": "Earth",
    },
    {
        "id": "artemis_i",
        "endDate": "2022-12-11T17:40:00Z",
        "summary": "Uncrewed test flight of NASA's SLS rocket and Orion crew vehicle. Sent Orion on a 25-day distant retrograde orbit around the Moon — the first step in returning humans to the lunar surface.",
        "impact": "Validated the SLS / Orion stack ahead of crewed missions (Artemis II onwards).",
        "category": "lunar",
        "primary_target": "Earth",
        **{k: v for k, v in ARTEMIS_I_INFO.items() if k != "window"},
    },
    {
        "id": "europa_clipper",
        "mission": "Europa Clipper",
        "agency": "NASA",
        "vehicle": "Falcon Heavy",
        "launchDate": "2024-10-14T16:06:00Z",
        "target": "Jupiter / Europa flybys",
        "status": "Cruise (arrival 2030)",
        "summary": "First dedicated mission to study Jupiter's icy moon Europa. Carries 9 science instruments to characterize its subsurface ocean.",
        "impact": "Could give the most definitive evidence yet of a habitable extraterrestrial ocean.",
        "source": "https://europa.nasa.gov/",
        "category": "planetary",
        "primary_target": "Jupiter",
    },
]
