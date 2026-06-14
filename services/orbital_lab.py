"""Synthetic Keplerian orbit generator for the educational labs.

Given user-supplied orbital parameters (eccentricity, semi-major axis), we
produce a list of point dicts matching the exact shape that
``scripts.data_fetcher._extract_vectors`` builds from JPL Horizons.

That way the sonifier, harmony engine, MIDI writer, and audio renderer all
work unchanged — the synthetic orbit feels identical to a real one to the
rest of the pipeline.

We assume:
* Central mass = 1 solar mass (μ = 1.32712440018e11 km³/s² → in AU³/day²
  that is 0.0002959122083).
* Orbit lies in the X-Y plane (z = 0). Inclination is intentionally
  excluded to keep the lab focused on Kepler's three laws.

References:
* Curtis, *Orbital Mechanics for Engineering Students*, ch. 3.
* JPL "Approximate Positions of the Planets" technical note.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List

# Standard gravitational parameter of the Sun, expressed in AU³ / day² so we
# can compute orbital period directly from `a` in AU via Kepler's 3rd law.
GM_SUN_AU3_PER_DAY2 = 0.0002959122082855911

KM_PER_AU = 1.49597870700e8
SEC_PER_DAY = 86400.0


def kepler_period_days(semi_major_axis_au: float) -> float:
    """Kepler's third law (T² = (4π² / GM) · a³)."""
    a = float(semi_major_axis_au)
    if a <= 0:
        raise ValueError("semi_major_axis_au must be > 0")
    return 2.0 * math.pi * math.sqrt(a ** 3 / GM_SUN_AU3_PER_DAY2)


def solve_kepler(mean_anomaly: float, eccentricity: float, max_iter: int = 32) -> float:
    """Solve M = E - e·sin(E) for the eccentric anomaly E.

    Newton–Raphson with a good initial guess converges in ~3-6 iterations
    for e ≤ 0.9. Returns E in radians, in the same branch as M.
    """
    e = float(eccentricity)
    if not (0.0 <= e < 1.0):
        raise ValueError("eccentricity must be in [0, 1)")
    # Normalize M into [-pi, pi] for numerical stability.
    M = math.atan2(math.sin(mean_anomaly), math.cos(mean_anomaly))
    E = M + e * math.sin(M)  # Initial guess (sufficient for moderate e)
    for _ in range(max_iter):
        delta = (E - e * math.sin(E) - M) / (1.0 - e * math.cos(E))
        E -= delta
        if abs(delta) < 1e-12:
            break
    return E


def true_anomaly_from_E(E: float, eccentricity: float) -> float:
    """Convert eccentric anomaly to true anomaly."""
    e = eccentricity
    return 2.0 * math.atan2(
        math.sqrt(1.0 + e) * math.sin(E / 2.0),
        math.sqrt(1.0 - e) * math.cos(E / 2.0),
    )


def keplerian_points(
    semi_major_axis_au: float,
    eccentricity: float,
    days_count: int,
    samples_per_day: int = 1,
    start_anomaly_rad: float = 0.0,
) -> List[Dict[str, Any]]:
    """Return point dicts for a Keplerian orbit covering ``days_count`` days.

    Matches the shape produced by ``_extract_vectors`` in data_fetcher.py,
    so the rest of the sonification pipeline accepts it as-is.

    Distances are in AU, velocities in AU/day → converted to km/s for the
    "speed" field so it lines up with our planet-data caches.
    """
    a = float(semi_major_axis_au)
    e = float(eccentricity)
    if a <= 0:
        raise ValueError("semi_major_axis_au must be > 0")
    if not (0.0 <= e < 1.0):
        raise ValueError("eccentricity must be in [0, 1)")
    if days_count <= 0 or samples_per_day <= 0:
        raise ValueError("days_count and samples_per_day must be > 0")

    n = math.sqrt(GM_SUN_AU3_PER_DAY2 / (a ** 3))  # mean motion (rad/day)
    samples = days_count * samples_per_day
    dt_day = 1.0 / samples_per_day

    # Conversion factor: AU/day -> km/s
    AU_PER_DAY_TO_KM_PER_S = KM_PER_AU / SEC_PER_DAY

    points: List[Dict[str, Any]] = []
    prev_speed: float | None = None
    now = datetime.now(timezone.utc)
    for i in range(samples):
        t_day = i * dt_day
        M = start_anomaly_rad + n * t_day
        E = solve_kepler(M, e)
        nu = true_anomaly_from_E(E, e)

        # Position in the orbital plane (z = 0).
        r = a * (1.0 - e * math.cos(E))
        x = r * math.cos(nu)
        y = r * math.sin(nu)
        z = 0.0

        # Velocity in the orbital plane. Standard expressions in AU/day.
        # vx = -(n·a / √(1-e²)) · sin(E)
        # vy =  (n·a · √(1-e²) / (1-e·cos(E))) · cos(E) ... use form below for stability.
        sqrt_1_minus_e2 = math.sqrt(max(0.0, 1.0 - e * e))
        speed_factor = n * a / max(1.0 - e * math.cos(E), 1e-12)
        vx = -speed_factor * math.sin(E)
        vy = speed_factor * sqrt_1_minus_e2 * math.cos(E)
        vz = 0.0

        speed_au_per_day = math.sqrt(vx * vx + vy * vy + vz * vz)
        speed_km_s = speed_au_per_day * AU_PER_DAY_TO_KM_PER_S

        radius = math.sqrt(x * x + y * y + z * z)
        # Radial velocity component (dot product with unit radius vector).
        radial_velocity = (x * vx + y * vy + z * vz) / max(radius, 1e-12)
        light_intensity_proxy = 1.0 / max(radius * radius, 1e-12)
        heading_xy = math.atan2(y, x)
        heading_z = math.atan2(z, max(math.sqrt(x * x + y * y), 1e-12))
        speed_delta = 0.0 if prev_speed is None else speed_km_s - prev_speed
        prev_speed = speed_km_s

        points.append(
            {
                "index": i,
                "date": now.isoformat(),
                "x": x,
                "y": y,
                "z": z,
                "vx": vx,
                "vy": vy,
                "vz": vz,
                "speed": speed_km_s,
                "radius": radius,
                "radial_velocity": radial_velocity,
                "light_intensity_proxy": light_intensity_proxy,
                "heading_xy": heading_xy,
                "heading_z": heading_z,
                "speed_delta": speed_delta,
            }
        )
    return points


def synthetic_dataset(
    semi_major_axis_au: float,
    eccentricity: float,
    days_count: int,
    object_name: str = "Custom Object",
) -> Dict[str, Any]:
    """Return a NASA-style dataset wrapper around `keplerian_points` so
    downstream services can use it interchangeably with the cached data.
    """
    points = keplerian_points(
        semi_major_axis_au=semi_major_axis_au,
        eccentricity=eccentricity,
        days_count=days_count,
    )
    return {
        "planet": object_name,
        "count": len(points),
        "points": points,
        "metadata": {
            "source": "synthetic-keplerian",
            "semi_major_axis_au": float(semi_major_axis_au),
            "eccentricity": float(eccentricity),
            "orbital_period_days": kepler_period_days(semi_major_axis_au),
            "days_count": int(days_count),
        },
    }
