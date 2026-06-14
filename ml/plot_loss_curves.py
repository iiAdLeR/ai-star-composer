"""Render train/val loss curves from the JSON written by
`train_sequence_lstm.py --history`.

  python -m ml.plot_loss_curves \
      --history ml/checkpoints/note_lstm_style_history.json \
      --out outputs/loss_curve.png

If `matplotlib` is unavailable the script exits with a friendly message
so the rest of the project still works on minimal installs.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import matplotlib

    matplotlib.use("Agg")  # headless / no display required
    import matplotlib.pyplot as plt
except ImportError:
    print("matplotlib not installed — `pip install matplotlib` to use plot_loss_curves.", file=sys.stderr)
    raise SystemExit(0)


def plot_history(history_path: str, out_path: str, title: str = "") -> None:
    with open(history_path, encoding="utf-8") as fp:
        payload = json.load(fp)
    rows = payload.get("history", [])
    if not rows:
        raise SystemExit(f"No history rows in {history_path}")

    epochs = [r["epoch"] for r in rows]
    train = [r["train_loss"] for r in rows]
    val_raw = [r.get("val_loss") for r in rows]
    has_val = any(v is not None for v in val_raw)

    fig, ax = plt.subplots(figsize=(9, 5.2), dpi=120)
    ax.plot(epochs, train, label="train", color="#22d3ee", linewidth=2.0)
    if has_val:
        val_pts = [(e, v) for e, v in zip(epochs, val_raw) if v is not None]
        ve, vv = zip(*val_pts)
        ax.plot(ve, vv, label="validation", color="#f472b6", linewidth=2.0, linestyle="--")
        best_v = payload.get("best_val_loss")
        if best_v is not None:
            best_ep = vv.index(min(vv)) + 1 if vv else None
            ax.axhline(best_v, color="#94a3b8", linewidth=0.7, alpha=0.6)
            ax.scatter([ve[vv.index(min(vv))]] if vv else [], [min(vv)] if vv else [], color="#f472b6", s=40, zorder=5)
            if best_ep is not None:
                ax.annotate(
                    f"best val={best_v:.4f} @ ep {best_ep}",
                    xy=(ve[vv.index(min(vv))], min(vv)),
                    xytext=(8, 8),
                    textcoords="offset points",
                    color="#f472b6",
                    fontsize=9,
                )

    ax.set_xlabel("Epoch")
    ax.set_ylabel("Cross-entropy loss")
    ax.set_title(title or f"LSTM training — {Path(history_path).name}")
    ax.grid(True, alpha=0.18, linestyle=":")
    ax.legend(loc="upper right")
    ax.set_xlim(left=min(epochs) - 0.2, right=max(epochs) + 0.2)
    fig.tight_layout()

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)
    print(f"Wrote {out_path}")  # noqa: ascii-only intentionally


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", required=True, help="Path to *_history.json from training.")
    ap.add_argument("--out", default="outputs/loss_curve.png")
    ap.add_argument("--title", default="")
    args = ap.parse_args()
    plot_history(args.history, args.out, title=args.title)


if __name__ == "__main__":
    main()
