"""Concatenate several JSONL exports (e.g. MAESTRO + Lakh subset) for one training file.

  python -m ml.merge_external_jsonl data/ml/external_notes_maestro.jsonl data/ml/external_notes_lakh.jsonl -o data/ml/external_notes_all.jsonl
"""
from __future__ import annotations

import argparse


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="JSONL files from ingest_external_midi")
    ap.add_argument("-o", "--output", required=True)
    args = ap.parse_args()

    n = 0
    with open(args.output, "w", encoding="utf-8") as out:
        for path in args.inputs:
            with open(path, encoding="utf-8") as fp:
                for line in fp:
                    line = line.strip()
                    if line:
                        out.write(line + "\n")
                        n += 1
    print(f"Merged {n} rows -> {args.output}")


if __name__ == "__main__":
    main()
