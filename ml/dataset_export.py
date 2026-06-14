"""
Export supervised rows for ML: physics features -> melody targets (from current symbolic engine).

Usage (from project root):
  python -m ml.dataset_export --output data/ml/train.jsonl --planets Mars,Jupiter --days 30

NASA rate limits: use --sleep 2 between planets. Re-use saved JSON with --load-json path.

Next steps after export: install requirements-ml.txt, run python -m ml.train_baseline_sklearn ...
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from typing import Any, Dict, Iterable, List, Tuple

# Project root on path when running as python -m ml.dataset_export
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.data_fetcher import fetch_velocity_dataset
from services.harmony_engine import Mode, generate_events
from services.music_styles import STYLES

STYLE_ORDER = tuple(STYLES.keys())


def _normalize_column(values: List[float]) -> List[float]:
    mn, mx = min(values), max(values)
    span = max(mx - mn, 1e-9)
    return [(v - mn) / span for v in values]


def _feature_row(
    points: List[Dict[str, Any]],
    i: int,
    prev_pitch: float,
    style_idx: int,
    mode_ai: float,
) -> List[float]:
    speed_n = _normalize_column([float(p["speed"]) for p in points])[i]
    light_n = _normalize_column([float(p.get("light_intensity_proxy", 0.0)) for p in points])[i]
    rad_n = _normalize_column([float(p.get("radial_velocity", 0.0)) for p in points])[i]
    radius_n = _normalize_column([float(p.get("radius", 0.0)) for p in points])[i]
    h = float(points[i].get("heading_xy", 0.0))
    sd_n = _normalize_column([float(p.get("speed_delta", 0.0)) for p in points])[i]
    return [
        speed_n,
        light_n,
        rad_n,
        radius_n,
        (h + math.pi) / (2 * math.pi),
        sd_n,
        prev_pitch / 127.0,
        style_idx / max(len(STYLE_ORDER) - 1, 1),
        mode_ai,
    ]


def rows_from_points(
    points: List[Dict[str, Any]],
    planet: str,
    style_id: str,
    mode: Mode,
    seed: int,
) -> Iterable[Dict[str, Any]]:
    if not points:
        return
    events = generate_events(
        points, mode=mode, style_id=style_id, seed=seed, planet_name=planet
    )
    if len(events) != len(points):
        return
    style_idx = STYLE_ORDER.index(style_id) if style_id in STYLE_ORDER else 0
    mode_ai = 1.0 if mode == "ai" else 0.0
    prev = 60.0
    for i, ev in enumerate(events):
        x = _feature_row(points, i, prev, style_idx, mode_ai)
        row = {
            "meta": {
                "planet": planet,
                "style": style_id,
                "mode": mode,
                "seed": seed,
                "step": i,
            },
            "x": x,
            "y_pitch": int(ev["base_note"]),
            "y_duration": float(ev["duration"]),
        }
        yield row
        prev = float(ev["base_note"])


def fetch_or_load_points(planet: str, days: int, load_json: str | None) -> Tuple[str, List[Dict[str, Any]]]:
    if load_json:
        with open(load_json, encoding="utf-8") as fp:
            data = json.load(fp)
        pts = data.get("points", [])
        return data.get("planet", planet), pts
    ds = fetch_velocity_dataset(planet_name=planet, days_count=days)
    return ds["planet"], ds["points"]


def export_jsonl(
    output_path: str,
    planets: List[str],
    days: int,
    styles: List[str],
    modes: List[Mode],
    seeds: List[int],
    sleep_s: float,
    load_json_per_planet: Dict[str, str] | None,
    single_json: str | None = None,
) -> int:
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    n = 0
    load_json_per_planet = load_json_per_planet or {}
    with open(output_path, "w", encoding="utf-8") as out:

        def write_all(name: str, points: List[Dict[str, Any]], used_fetch: bool) -> None:
            nonlocal n
            if not points:
                return
            for style_id in styles:
                sid = style_id.strip().lower()
                if sid not in STYLES:
                    continue
                for mode in modes:
                    for seed in seeds:
                        for row in rows_from_points(points, name, sid, mode, int(seed)):
                            out.write(json.dumps(row, ensure_ascii=False) + "\n")
                            n += 1
            if sleep_s > 0 and used_fetch:
                time.sleep(sleep_s)

        if single_json:
            name, points = fetch_or_load_points("", days, single_json)
            write_all(name, points, used_fetch=False)
            return n

        for planet in planets:
            lj = load_json_per_planet.get(planet.strip().capitalize())
            name, points = fetch_or_load_points(planet.strip(), days, lj)
            write_all(name, points, used_fetch=not lj)
    return n


def main() -> None:
    p = argparse.ArgumentParser(description="Export ML dataset (JSONL) from NASA + sonification.")
    p.add_argument("--output", default="data/ml/sonification.jsonl")
    p.add_argument("--planets", default="Mars,Jupiter", help="Comma-separated")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--styles", default="calm,pop,study,cinematic")
    p.add_argument("--modes", default="baseline,ai")
    p.add_argument("--seeds", default="0,1,2,3,4")
    p.add_argument("--sleep", type=float, default=2.0, help="Seconds between NASA fetches")
    p.add_argument(
        "--load-json",
        default=None,
        help="Use saved NASA dataset JSON (no API); still iterates styles/modes/seeds",
    )
    args = p.parse_args()

    planets = [x.strip() for x in args.planets.split(",") if x.strip()]
    styles = [x.strip() for x in args.styles.split(",") if x.strip()]
    modes_t = [x.strip() for x in args.modes.split(",") if x.strip()]
    modes: List[Mode] = []
    for m in modes_t:
        if m in ("baseline", "ai"):
            modes.append(m)  # type: ignore[arg-type]
    if not modes:
        modes = ["ai", "baseline"]
    seeds = [int(x.strip()) for x in args.seeds.split(",") if x.strip().isdigit()]

    count = export_jsonl(
        args.output,
        planets,
        args.days,
        styles,
        modes,
        seeds,
        args.sleep,
        None,
        single_json=args.load_json,
    )
    print(f"Wrote {count} rows -> {args.output}")


if __name__ == "__main__":
    main()
