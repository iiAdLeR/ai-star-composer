"""
Baseline supervised model: predict base_note (pitch class) from exported feature vector.

Requires: pip install -r requirements-ml.txt

  python -m ml.train_baseline_sklearn --data data/ml/sonification.jsonl --out ml/checkpoints/pitch_rf.joblib
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

try:
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report
    from sklearn.model_selection import train_test_split
except ImportError as exc:
    print("Missing deps. Run: pip install -r requirements-ml.txt", file=sys.stderr)
    raise SystemExit(1) from exc


def load_jsonl(path: str):
    xs: list[list[float]] = []
    ys: list[int] = []
    with open(path, encoding="utf-8") as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            xs.append(row["x"])
            ys.append(int(row["y_pitch"]))
    return np.asarray(xs, dtype=np.float32), np.asarray(ys, dtype=np.int64)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="JSONL from ml.dataset_export")
    ap.add_argument("--out", default="ml/checkpoints/pitch_rf.joblib")
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument(
        "--min-rows",
        type=int,
        default=50,
        help="Minimum rows required (lower only for smoke tests, e.g. 25)",
    )
    args = ap.parse_args()

    X, y = load_jsonl(args.data)
    if len(X) < args.min_rows:
        print(
            f"Need more rows (>={args.min_rows}). Export a larger dataset or pass --min-rows.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42
    )
    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=28,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42,
    )
    clf.fit(X_train, y_train)
    pred = clf.predict(X_test)
    print(classification_report(y_test, pred, zero_division=0))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    joblib.dump({"model": clf, "feature_dim": X.shape[1]}, args.out)
    print(f"Saved {args.out}")


if __name__ == "__main__":
    main()
