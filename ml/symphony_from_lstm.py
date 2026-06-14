"""
Full symphony MIDI (piano / bass / harmony arp / drums) driven by LSTM melody.

Uses the same timing and arrangement as `save_advanced_composition`, but replaces
base/lead/harmony/bass per step with pitches sampled from the style-conditioned LSTM.

  python -m ml.symphony_from_lstm \\
    --checkpoint ml/checkpoints/note_lstm_style.pt \\
    --load-json data/mars_ml_pipeline.json \\
    --style pop \\
    --out-dir outputs
"""
from __future__ import annotations

import argparse
import json
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from ml.generate_from_lstm import dur_to_bin, planet_name_to_idx, sample, style_name_to_idx
from scripts.sonifier import save_symphony_midi_from_events
from services.harmony_engine import Mode, blend_lstm_pitches_into_events, generate_events


def _load_points(path: str) -> tuple[str, list]:
    with open(path, encoding="utf-8") as fp:
        data = json.load(fp)
    planet = str(data.get("planet", "Mars"))
    pts = data.get("points") or []
    if not pts:
        raise SystemExit(f"No points in {path}")
    return planet, pts


def main() -> None:
    ap = argparse.ArgumentParser(description="LSTM melody + symbolic symphony arrangement")
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--load-json", required=True, help="NASA pipeline JSON with planet + points[]")
    ap.add_argument("--style", default="pop", help="calm|pop|study|cinematic")
    ap.add_argument(
        "--planet",
        default="auto",
        help="Planet name for planet-conditioned checkpoints, or 'auto' to use JSON planet",
    )
    ap.add_argument("--out-dir", default="outputs")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--mode", default="ai", choices=("ai", "baseline"))
    ap.add_argument(
        "--steps",
        type=int,
        default=0,
        help="Max points / LSTM steps; 0 = use all points in JSON",
    )
    ap.add_argument("--seed-pitch", type=int, default=60)
    ap.add_argument("--temperature", type=float, default=0.95)
    ap.add_argument("--device", default="cpu")
    ap.add_argument(
        "--suffix",
        default="",
        help="Output filename suffix (default: ai_<style>_lstm_symphony)",
    )
    args = ap.parse_args()

    planet, points = _load_points(args.load_json)
    if args.steps and args.steps > 0:
        points = points[: int(args.steps)]
    n = len(points)
    style_id = args.style.strip().lower()
    sid = style_name_to_idx(style_id)
    planet_name = planet if str(args.planet).strip().lower() == "auto" else args.planet
    pid = planet_name_to_idx(planet_name)

    pitches = sample(
        args.checkpoint,
        n,
        args.seed_pitch,
        dur_to_bin(0.35),
        args.temperature,
        args.device,
        style_idx=sid,
        planet_idx=pid,
    )

    mode: Mode = "ai" if args.mode == "ai" else "baseline"
    events = generate_events(
        points, mode=mode, style_id=style_id, seed=args.seed, planet_name=planet
    )
    blend_lstm_pitches_into_events(
        events, points, pitches, style_id, args.seed, planet_name=planet
    )

    suffix = args.suffix.strip() or f"ai_{style_id}_lstm_symphony"
    out = save_symphony_midi_from_events(
        events,
        planet_name=planet,
        style_id=style_id,
        outputs_dir=args.out_dir,
        filename_suffix=suffix,
    )
    print(f"Wrote {out}  events={len(events)}  lstm_steps={len(pitches)}  style={style_id}")


if __name__ == "__main__":
    main()
