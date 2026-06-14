"""
Convert external MIDI files (e.g. MAESTRO, Lakh MIDI — check each dataset license) into
JSONL note sequences for sequence models (LSTM / Transformer).

Place .mid/.midi under e.g. data/external_midi/ then:

  pip install mido
  python -m ml.ingest_external_midi --input-dir data/external_midi --output data/ml/external_notes.jsonl

Optional: tag every row with an app style (0=calm, 1=pop, 2=study, 3=cinematic) for style-conditioned LSTM:

  python -m ml.ingest_external_midi --input-dir data/external_midi/my_pop_subset --style-idx 1 --output data/ml/external_pop.jsonl

Does not download copyrighted corpora for you; you must obtain files legally.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Tuple

from services.music_styles import STYLES

STYLE_ORDER = tuple(STYLES.keys())

try:
    import mido
except ImportError as exc:
    print("Install mido: pip install mido", file=sys.stderr)
    raise SystemExit(1) from exc


def _extract_notes(path: str, max_notes: int) -> List[Dict[str, Any]]:
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat or 480
    t_abs = 0
    active: Dict[int, int] = {}
    ended: List[Tuple[float, int, float]] = []

    for msg in mido.merge_tracks(mid.tracks):
        t_abs += msg.time
        beat = t_abs / tpb

        if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
            active[msg.note] = t_abs
        elif msg.type == "note_off" or (msg.type == "note_on" and getattr(msg, "velocity", 0) == 0):
            note = getattr(msg, "note", None)
            if note is None:
                continue
            start_tick = active.pop(note, None)
            if start_tick is None:
                continue
            dur_beats = (t_abs - start_tick) / tpb
            start_beat = start_tick / tpb
            if dur_beats < 0.04 or dur_beats > 16.0:
                continue
            if note < 21 or note > 108:
                continue
            ended.append((start_beat, int(note), float(dur_beats)))

    ended.sort(key=lambda x: x[0])
    notes = [{"start": a, "pitch": p, "duration": d} for a, p, d in ended]
    if max_notes > 0 and len(notes) > max_notes:
        notes = notes[:max_notes]
    return notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-dir", required=True, help="Folder with .mid / .midi")
    ap.add_argument("--output", default="data/ml/external_notes.jsonl")
    ap.add_argument("--max-notes-per-file", type=int, default=400)
    ap.add_argument("--min-notes", type=int, default=8, help="Skip files with fewer notes")
    ap.add_argument(
        "--style-idx",
        type=int,
        default=None,
        help="If set (0..3), add style_idx/style_id for calm,pop,study,cinematic to each row",
    )
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    count = 0
    with open(args.output, "w", encoding="utf-8") as out:
        for root, _, files in os.walk(args.input_dir):
            for name in sorted(files):
                low = name.lower()
                if not (low.endswith(".mid") or low.endswith(".midi")):
                    continue
                path = os.path.join(root, name)
                try:
                    notes = _extract_notes(path, args.max_notes_per_file)
                except Exception as exc:
                    print(f"Skip {path}: {exc}", file=sys.stderr)
                    continue
                if len(notes) < args.min_notes:
                    continue
                row: Dict[str, Any] = {
                    "source": os.path.relpath(path, args.input_dir),
                    "path": path,
                    "notes": notes,
                }
                if args.style_idx is not None:
                    sid = max(0, min(len(STYLE_ORDER) - 1, int(args.style_idx)))
                    row["style_idx"] = sid
                    row["style_id"] = STYLE_ORDER[sid]
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                count += 1
    print(f"Wrote {count} sequence rows -> {args.output}")


if __name__ == "__main__":
    main()
