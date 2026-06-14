"""
Train LSTM on note sequences (JSONL rows with "notes": [...]).

- External MIDI: from ml.ingest_external_midi (no style_idx → style 0 only).
- App styles: from ml.export_style_sequences (style_idx 0..3 per calm/pop/study/cinematic).

Style-conditioned model: auto-enabled when any row in the JSONL contains "style_idx"
(scanned up to 8000 lines). Rows without style_idx are skipped when style mode is on.

Planet-conditioned: auto-enabled when any row contains "planet_idx" (from export_style_sequences,
0..7 for Mercury..Neptune). Rows without planet_idx are skipped when planet mode is on.
External MIDI JSONL without planet_idx trains style-only unless --planet-conditioned off.

  python -m ml.train_sequence_lstm --data data/ml/style_sequences.jsonl --epochs 20
  python -m ml.train_sequence_lstm --data data/ml/external_notes_maestro.jsonl --epochs 15
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import List, Optional, Tuple

# Windows / Conda / Jupyter: يمنع تعارض OpenMP (libiomp5md.dll) مع PyTorch
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, Dataset, Subset
except ImportError as exc:
    print("Install torch: pip install torch", file=sys.stderr)
    raise SystemExit(1) from exc

DUR_BINS = 32
PITCH_VOCAB = 128
# Default 4 = studio personas only (calm/pop/study/cinematic).
# Birthday-style training raises this to 9 (4 studio + 5 birthday).
# Callers override via --num-styles.
NUM_APP_STYLES = 4
NUM_PLANETS = 8


def dur_to_bin(d: float) -> int:
    d = max(0.06, min(4.0, float(d)))
    return min(DUR_BINS - 1, int((d / 4.0) * DUR_BINS))


def jsonl_has_style_idx(path: str, max_scan_lines: int = 8000) -> bool:
    """True if any row declares style_idx (needed when merging external + style_sequences)."""
    with open(path, encoding="utf-8") as fp:
        for i, line in enumerate(fp):
            if i >= max_scan_lines:
                break
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and "style_idx" in row:
                return True
    return False


def jsonl_has_planet_idx(path: str, max_scan_lines: int = 8000) -> bool:
    with open(path, encoding="utf-8") as fp:
        for i, line in enumerate(fp):
            if i >= max_scan_lines:
                break
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and "planet_idx" in row:
                return True
    return False


class SeqDataset(Dataset):
    def __init__(
        self,
        jsonl_paths,
        seq_len: int,
        use_style: bool,
        use_planet: bool,
        *,
        num_styles: int = NUM_APP_STYLES,
        num_planets: int = NUM_PLANETS,
    ):
        self.samples: List[Tuple[int, int, np.ndarray, np.ndarray, np.ndarray]] = []
        self.seq_len = seq_len
        self.use_style = use_style
        self.use_planet = use_planet
        self.num_styles = num_styles
        self.num_planets = num_planets
        # Accept either a single path or a list — handy for mixing the
        # studio + birthday corpora into one training run.
        if isinstance(jsonl_paths, str):
            jsonl_paths = [jsonl_paths]
        for path in jsonl_paths:
            with open(path, encoding="utf-8") as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    row = json.loads(line)
                    notes = row.get("notes", [])
                    if len(notes) < seq_len + 2:
                        continue
                    if use_style:
                        if "style_idx" not in row:
                            continue
                        style_i = max(0, min(num_styles - 1, int(row["style_idx"])))
                    else:
                        style_i = 0
                    if use_planet:
                        if "planet_idx" not in row:
                            continue
                        planet_i = max(0, min(num_planets - 1, int(row["planet_idx"])))
                    else:
                        planet_i = 0
                    pitches = np.array([int(n["pitch"]) for n in notes], dtype=np.int64)
                    durs = np.array(
                        [dur_to_bin(n["duration"]) for n in notes], dtype=np.int64
                    )
                    for i in range(0, len(pitches) - seq_len - 1, max(1, seq_len // 2)):
                        p = pitches[i : i + seq_len]
                        d = durs[i : i + seq_len]
                        tgt = pitches[i + 1 : i + seq_len + 1]
                        self.samples.append((style_i, planet_i, p, d, tgt))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        s, pl, p, d, t = self.samples[idx]
        return (
            torch.tensor(s, dtype=torch.long),
            torch.tensor(pl, dtype=torch.long),
            torch.from_numpy(p),
            torch.from_numpy(d),
            torch.from_numpy(t),
        )


class NoteLSTM(nn.Module):
    def __init__(
        self,
        emb_p: int = 64,
        emb_d: int = 32,
        hidden: int = 192,
        layers: int = 2,
        num_styles: int = 0,
        style_dim: int = 24,
        num_planets: int = 0,
        planet_dim: int = 16,
    ):
        super().__init__()
        self.num_styles = num_styles
        self.num_planets = num_planets
        self.emb_p = nn.Embedding(PITCH_VOCAB, emb_p)
        self.emb_d = nn.Embedding(DUR_BINS, emb_d)
        if num_styles > 0:
            self.style_emb = nn.Embedding(num_styles, style_dim)
        else:
            self.style_emb = None
        if num_planets > 0:
            self.planet_emb = nn.Embedding(num_planets, planet_dim)
        else:
            self.planet_emb = None
        in_dim = emb_p + emb_d
        if num_styles > 0:
            in_dim += style_dim
        if num_planets > 0:
            in_dim += planet_dim
        self.lstm = nn.LSTM(in_dim, hidden, num_layers=layers, batch_first=True, dropout=0.1)
        self.head = nn.Linear(hidden, PITCH_VOCAB)

    def forward(
        self,
        pitch: torch.Tensor,
        dur: torch.Tensor,
        style_idx: Optional[torch.Tensor] = None,
        planet_idx: Optional[torch.Tensor] = None,
    ):
        b, t = pitch.shape
        ep = self.emb_p(pitch)
        ed = self.emb_d(dur)
        parts: List[torch.Tensor] = []
        if self.style_emb is not None:
            if style_idx is None:
                raise ValueError("style_idx required for style-conditioned model")
            s = self.style_emb(style_idx).unsqueeze(1).expand(b, t, -1)
            parts.append(s)
        if self.planet_emb is not None:
            if planet_idx is None:
                raise ValueError("planet_idx required for planet-conditioned model")
            pl = self.planet_emb(planet_idx).unsqueeze(1).expand(b, t, -1)
            parts.append(pl)
        parts.extend([ep, ed])
        e = torch.cat(parts, dim=-1)
        h, _ = self.lstm(e)
        return self.head(h)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--data",
        required=True,
        help=(
            "JSONL from ingest or export_style_sequences. May be a single path "
            "or a comma-separated list to mix multiple corpora into one run."
        ),
    )
    ap.add_argument("--out", default="ml/checkpoints/note_lstm.pt")
    ap.add_argument("--seq-len", type=int, default=32)
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument(
        "--num-styles",
        type=int,
        default=NUM_APP_STYLES,
        help=(
            "Size of the style embedding vocabulary. Use 9 to also learn the 5 "
            "birthday styles (4 studio + 5 birthday)."
        ),
    )
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--device", default="cpu")
    ap.add_argument(
        "--style-conditioned",
        default="auto",
        choices=["auto", "on", "off"],
        help="auto: detect from JSONL; on/off: force",
    )
    ap.add_argument(
        "--planet-conditioned",
        default="auto",
        choices=["auto", "on", "off"],
        help="auto: detect planet_idx in JSONL (export_style_sequences); off for MAESTRO-only rows",
    )
    ap.add_argument(
        "--val-split",
        type=float,
        default=0.1,
        help="Fraction (0..0.4) reserved for validation. 0 disables val tracking.",
    )
    ap.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Seed for train/val partition + torch RNGs (reproducibility).",
    )
    ap.add_argument(
        "--history",
        default=None,
        help="Optional path to save per-epoch loss JSON (train + val).",
    )
    ap.add_argument(
        "--early-stop-patience",
        type=int,
        default=0,
        help="Stop when val loss has not improved for N epochs (0 = disabled).",
    )
    args = ap.parse_args()

    data_paths = [p.strip() for p in args.data.split(",") if p.strip()]
    probe_path = data_paths[0]
    if args.style_conditioned == "auto":
        use_style = jsonl_has_style_idx(probe_path)
    elif args.style_conditioned == "on":
        use_style = True
    else:
        use_style = False

    if args.planet_conditioned == "auto":
        use_planet = jsonl_has_planet_idx(probe_path)
    elif args.planet_conditioned == "on":
        use_planet = True
    else:
        use_planet = False

    ds = SeqDataset(
        data_paths,
        args.seq_len,
        use_style,
        use_planet,
        num_styles=int(args.num_styles),
        num_planets=NUM_PLANETS,
    )
    if len(ds) < 20:
        print("Need more sequences (longer pieces or more JSONL rows).", file=sys.stderr)
        raise SystemExit(2)

    # Reproducible RNG seeding for both the partition and torch.
    seed = int(args.seed) & 0xFFFFFFFF
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)

    val_frac = max(0.0, min(0.4, float(args.val_split)))
    indices = np.arange(len(ds))
    rng.shuffle(indices)
    n_val = int(round(len(ds) * val_frac))
    val_indices = indices[:n_val].tolist()
    train_indices = indices[n_val:].tolist()
    train_ds = Subset(ds, train_indices)
    val_ds: Optional[Subset] = Subset(ds, val_indices) if n_val > 0 else None

    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, drop_last=True)
    val_dl = (
        DataLoader(val_ds, batch_size=args.batch, shuffle=False, drop_last=False)
        if val_ds is not None
        else None
    )

    dev = torch.device(args.device)
    num_styles = int(args.num_styles) if use_style else 0
    num_planets = NUM_PLANETS if use_planet else 0
    model = NoteLSTM(num_styles=num_styles, num_planets=num_planets).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    loss_fn = nn.CrossEntropyLoss()

    history: List[dict] = []
    best_val = float("inf")
    no_improve = 0
    best_state: Optional[dict] = None
    for ep in range(args.epochs):
        # ---- train ----
        model.train()
        total = 0.0
        n = 0
        for style, planet, pitch, dur, tgt in train_dl:
            pitch, dur, tgt = pitch.to(dev), dur.to(dev), tgt.to(dev)
            style = style.to(dev)
            planet = planet.to(dev)
            opt.zero_grad()
            logits = model(
                pitch,
                dur,
                style if use_style else None,
                planet if use_planet else None,
            )
            loss = loss_fn(logits.reshape(-1, PITCH_VOCAB), tgt.reshape(-1))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += float(loss.item())
            n += 1
        train_loss = total / max(n, 1)

        # ---- validation ----
        val_loss: Optional[float] = None
        if val_dl is not None and len(val_dl) > 0:
            model.eval()
            with torch.no_grad():
                vt = 0.0
                vn = 0
                for style, planet, pitch, dur, tgt in val_dl:
                    pitch, dur, tgt = pitch.to(dev), dur.to(dev), tgt.to(dev)
                    style = style.to(dev)
                    planet = planet.to(dev)
                    logits = model(
                        pitch,
                        dur,
                        style if use_style else None,
                        planet if use_planet else None,
                    )
                    vloss = loss_fn(logits.reshape(-1, PITCH_VOCAB), tgt.reshape(-1))
                    vt += float(vloss.item())
                    vn += 1
                val_loss = vt / max(vn, 1)

        tags = []
        if use_style:
            tags.append("style")
        if use_planet:
            tags.append("planet")
        tag = f" [{'+'.join(tags)}]" if tags else ""
        if val_loss is not None:
            print(
                f"epoch {ep+1}/{args.epochs}{tag}  train_loss={train_loss:.4f}  val_loss={val_loss:.4f}"
            )
        else:
            print(f"epoch {ep+1}/{args.epochs}{tag}  train_loss={train_loss:.4f}")

        history.append(
            {
                "epoch": ep + 1,
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6) if val_loss is not None else None,
            }
        )

        if val_loss is not None:
            if val_loss < best_val - 1e-4:
                best_val = val_loss
                no_improve = 0
                # Snapshot the best model so we can restore it before saving.
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            else:
                no_improve += 1
                if args.early_stop_patience > 0 and no_improve >= args.early_stop_patience:
                    print(
                        f"Early stop at epoch {ep+1}: no val improvement for "
                        f"{args.early_stop_patience} epochs (best val={best_val:.4f})"
                    )
                    break

    # Restore the best weights if we collected any.
    if best_state is not None:
        model.load_state_dict(best_state)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "seq_len": args.seq_len,
            "dur_bins": DUR_BINS,
            "pitch_vocab": PITCH_VOCAB,
            "use_style": use_style,
            "num_styles": num_styles,
            "use_planet": use_planet,
            "num_planets": num_planets,
            "training_meta": {
                "seed": seed,
                "val_split": val_frac,
                "best_val_loss": best_val if best_val < float("inf") else None,
                "epochs_trained": len(history),
            },
        },
        args.out,
    )

    history_path = args.history
    if history_path is None and args.out:
        history_path = os.path.splitext(args.out)[0] + "_history.json"
    if history_path:
        os.makedirs(os.path.dirname(history_path) or ".", exist_ok=True)
        with open(history_path, "w", encoding="utf-8") as fp:
            json.dump(
                {
                    "data": args.data,
                    "seed": seed,
                    "val_split": val_frac,
                    "epochs_total": args.epochs,
                    "epochs_trained": len(history),
                    "best_val_loss": best_val if best_val < float("inf") else None,
                    "history": history,
                },
                fp,
                indent=2,
            )
        print(f"Wrote loss history -> {history_path}")

    print(
        f"Saved {args.out}  use_style={use_style}  use_planet={use_planet}  "
        f"val_split={val_frac}  best_val={best_val if best_val < float('inf') else 'n/a'}"
    )


if __name__ == "__main__":
    main()
