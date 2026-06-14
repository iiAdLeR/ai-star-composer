"""
Export monophonic note sequences labeled by app style (calm/pop/study/cinematic).

Each line = one (planet, NASA window, mode, seed, style) run through generate_events.
The LSTM can then learn: same physics, different melodic/rhythmic patterns per style_idx.

Usage (project root):
  python -m ml.export_style_sequences --load-json data/mars_xxxxx.json --output data/ml/style_sequences.jsonl
  python -m ml.export_style_sequences --days 90 --sleep 2 --output data/ml/style_sequences.jsonl
  (افتراضياً: كل الكواكب الثمانية في ملف واحد؛ استخدم --planets لتضييق القائمة.)

Then train:
  python -m ml.train_sequence_lstm --data data/ml/style_sequences.jsonl --out ml/checkpoints/note_lstm_style.pt
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts.data_fetcher import ALL_PLANETS, fetch_velocity_dataset
from services.harmony_engine import Mode, generate_events
from services.music_styles import STYLES
from services.planet_rhythm import normalize_planet

STYLE_ORDER = tuple(STYLES.keys())


def _style_idx(style_id: str) -> int:
    k = (style_id or "calm").strip().lower()
    if k not in STYLES:
        return 0
    return STYLE_ORDER.index(k)


def _planet_idx(planet_name: str) -> int:
    k = normalize_planet(planet_name)
    try:
        return ALL_PLANETS.index(k)
    except ValueError:
        return 2


def _events_to_notes(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "start": float(ev["time"]),
            "pitch": int(ev["base_note"]),
            "duration": float(ev["duration"]),
        }
        for ev in events
    ]


def export_style_sequences(
    output_path: str,
    points: List[Dict[str, Any]],
    planet: str,
    modes: List[Mode],
    seeds: List[int],
    append: bool = False,
) -> int:
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    n = 0
    file_mode = "a" if append else "w"
    with open(output_path, file_mode, encoding="utf-8") as out:
        for style_id in STYLE_ORDER:
            sid = _style_idx(style_id)
            for mode in modes:
                for seed in seeds:
                    events = generate_events(
                        points,
                        mode=mode,
                        style_id=style_id,
                        seed=int(seed),
                        planet_name=planet,
                    )
                    if len(events) < 4:
                        continue
                    row = {
                        "kind": "style_sonification",
                        "style_idx": sid,
                        "style_id": style_id,
                        "planet": planet,
                        "planet_idx": _planet_idx(planet),
                        "mode": mode,
                        "seed": int(seed),
                        "notes": _events_to_notes(events),
                    }
                    out.write(json.dumps(row, ensure_ascii=False) + "\n")
                    n += 1
    return n


def _default_seeds_csv() -> str:
    return ",".join(str(i) for i in range(32))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default="data/ml/style_sequences.jsonl")
    ap.add_argument(
        "--planets",
        default=",".join(ALL_PLANETS),
        help="Comma-separated (if not using --load-json). Default: all 8 planets → one JSONL.",
    )
    ap.add_argument("--days", type=int, default=90, help="Horizons window length (more days → more points)")
    ap.add_argument("--modes", default="baseline,ai")
    ap.add_argument(
        "--seeds",
        default=_default_seeds_csv(),
        help="Comma-separated RNG seeds per (planet, style, mode); default 0..31",
    )
    ap.add_argument("--sleep", type=float, default=2.0, help="Seconds between NASA fetches (rate courtesy)")
    ap.add_argument("--load-json", default=None, help="NASA dataset JSON (points[]) — single planet; ignores --planets")
    ap.add_argument(
        "--append",
        action="store_true",
        help="Append to --output instead of overwriting (chain multiple --load-json runs)",
    )
    args = ap.parse_args()

    modes_t = [m.strip() for m in args.modes.split(",") if m.strip()]
    modes: List[Mode] = [m for m in modes_t if m in ("baseline", "ai")]  # type: ignore[list-item]
    if not modes:
        modes = ["ai", "baseline"]
    seeds = [int(x.strip()) for x in args.seeds.split(",") if x.strip().isdigit()]

    total = 0
    if args.load_json:
        with open(args.load_json, encoding="utf-8") as fp:
            data = json.load(fp)
        pts = data.get("points", [])
        planet = data.get("planet", "planet")
        if not pts:
            print("No points in JSON.", file=sys.stderr)
            raise SystemExit(1)
        total += export_style_sequences(
            args.output, pts, planet, modes, seeds, append=bool(args.append)
        )
    else:
        planets = [p.strip() for p in args.planets.split(",") if p.strip()]
        append_file = False
        first_fetch = True
        for planet in planets:
            if not first_fetch and args.sleep > 0:
                time.sleep(args.sleep)
            first_fetch = False
            try:
                ds = fetch_velocity_dataset(planet_name=planet, days_count=args.days)
            except Exception as exc:
                print(f"Skipping {planet}: {exc}", file=sys.stderr)
                continue
            pts = ds.get("points", [])
            if not pts:
                continue
            n = export_style_sequences(
                args.output,
                pts,
                ds.get("planet", planet),
                modes,
                seeds,
                append=append_file,
            )
            total += n
            if n > 0:
                append_file = True
    print(f"Wrote {total} labeled style sequences -> {args.output}")


if __name__ == "__main__":
    main()
