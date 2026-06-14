"""
Export style_sequences JSONL from all planet JSON files under data/nasa_planets/
(no NASA fetch). Then train with train_sequence_lstm.

  python -m ml.bundle_local_planet_exports
  python -m ml.bundle_local_planet_exports --seeds 0,1,2,3  # override default 0..31
"""
from __future__ import annotations

import argparse
import json
import os
import sys

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml.export_style_sequences import export_style_sequences
from services.harmony_engine import Mode


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dir",
        default="data/nasa_planets",
        help="Folder with mercury.json … neptune.json",
    )
    ap.add_argument("--output", default="data/ml/style_sequences_8planets.jsonl")
    ap.add_argument("--modes", default="baseline,ai")
    ap.add_argument(
        "--seeds",
        default=None,
        help="Comma-separated seeds; default 0..31 (matches graduation notebook)",
    )
    args = ap.parse_args()

    modes_t = [m.strip() for m in args.modes.split(",") if m.strip()]
    modes: list[Mode] = [m for m in modes_t if m in ("baseline", "ai")]  # type: ignore[list-item]
    if not modes:
        modes = ["ai", "baseline"]
    if args.seeds is None:
        seeds = list(range(32))
    else:
        seeds = [int(x.strip()) for x in args.seeds.split(",") if x.strip().isdigit()]
    if not seeds:
        seeds = list(range(32))

    d = args.dir
    if not os.path.isdir(d):
        raise SystemExit(f"Missing folder: {d}")

    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".json"))
    if not files:
        raise SystemExit(f"No .json in {d}")

    out = args.output
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if os.path.isfile(out):
        os.remove(out)

    total = 0
    for i, fn in enumerate(files):
        path = os.path.join(d, fn)
        with open(path, encoding="utf-8") as fp:
            data = json.load(fp)
        pts = data.get("points", [])
        planet = str(data.get("planet", fn.replace(".json", "").capitalize()))
        if not pts:
            print(f"skip empty: {fn}", file=sys.stderr)
            continue
        n = export_style_sequences(
            out,
            pts,
            planet,
            modes,
            seeds,
            append=total > 0,
        )
        total += n
        print(f"{fn} -> +{n} rows (planet={planet})")

    print(f"Total {total} rows -> {out}")


if __name__ == "__main__":
    main()
