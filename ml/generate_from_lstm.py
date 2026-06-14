"""
Sample a short monophonic line from a trained NoteLSTM and write a MIDI file.

Style-conditioned checkpoints (from export_style_sequences + train_sequence_lstm):
  python -m ml.generate_from_lstm --checkpoint ml/checkpoints/note_lstm_style.pt --style pop --out outputs/lstm_pop.mid

Legacy (no style in checkpoint):
  python -m ml.generate_from_lstm --checkpoint ml/checkpoints/note_lstm.pt --out outputs/lstm_sample.mid

For full multi-track MIDI like *_symphony.mid (bass, harmony, drums), use:
  python -m ml.symphony_from_lstm --checkpoint ... --load-json data/mars_ml_pipeline.json --style pop
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
from typing import List, Optional, Tuple

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import torch

from ml.train_sequence_lstm import DUR_BINS, NoteLSTM, dur_to_bin
from scripts.data_fetcher import ALL_PLANETS
from services.planet_rhythm import normalize_planet


def _torch_load_checkpoint(path: str, map_location):
    """torch.load متوافق مع PyTorch قديم (<2.0) وجديد (weights_only في 2.6+)."""
    try:
        return torch.load(path, map_location=map_location, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=map_location)


from services.music_styles import MusicStyle, STYLES, get_style, resolve_engine_persona

try:
    from midiutil import MIDIFile
except ImportError as exc:
    print("Need midiutil (project base requirements).", file=sys.stderr)
    raise SystemExit(1) from exc

STYLE_ORDER = tuple(STYLES.keys())
_PERSONA_ORDER = ("calm", "pop", "study", "cinematic")

# إحساس مختلف لكل ستايل عند الكتابة إلى MIDI (كان كل شيء 0.25 → طنطنة واحدة)
_STYLE_RENDER = {
    "calm": {"legato": 0.9, "step_jitter": 0.14, "vel_base": 58, "vel_spread": 22, "break_after": 3},
    "pop": {"legato": 0.4, "step_jitter": 0.22, "vel_base": 72, "vel_spread": 36, "break_after": 2},
    "study": {"legato": 0.95, "step_jitter": 0.07, "vel_base": 52, "vel_spread": 16, "break_after": 4},
    "cinematic": {"legato": 0.65, "step_jitter": 0.17, "vel_base": 64, "vel_spread": 30, "break_after": 3},
}

# درجة حرارة افتراضية لكل ستايل (أعلى = أكثر تنويعاً)
_DEFAULT_TEMP = {"calm": 1.02, "pop": 0.88, "study": 1.08, "cinematic": 0.94}

# nucleus خفيف يقلّل تكرار نفس النوتة
_DEFAULT_TOP_P = {"calm": 0.94, "pop": 0.9, "study": 0.96, "cinematic": 0.92}


def style_name_to_idx(name: str, num_styles: int = 0) -> int:
    """Map a style id to an embedding index.

    The shipped checkpoints were trained with only the 4 studio personas
    (`calm/pop/study/cinematic`).  Birthday styles (`celebration`, `tender`, ...)
    fall outside that vocabulary, so we route them to their engine persona
    so the embedding stays in-range. When `num_styles >= len(STYLE_ORDER)`
    the full vocabulary is used (future checkpoints retrained on birthday
    styles).
    """
    k = (name or "calm").strip().lower()
    if num_styles and num_styles >= len(STYLE_ORDER):
        return STYLE_ORDER.index(k) if k in STYLES else 0
    persona = resolve_engine_persona(k)
    try:
        idx = _PERSONA_ORDER.index(persona)
    except ValueError:
        idx = 0
    if num_styles and idx >= num_styles:
        return 0
    return idx


def planet_name_to_idx(name: str) -> int:
    """0..7 = Mercury..Neptune (matches export_style_sequences planet_idx)."""
    k = normalize_planet(name)
    try:
        return ALL_PLANETS.index(k)
    except ValueError:
        return 2


def _snap_pitch_to_scale(pitch: int, scale: Tuple[int, ...]) -> int:
    if not scale:
        return max(0, min(127, pitch))
    best = int(pitch)
    best_d = 999
    for delta in range(-48, 49, 12):
        for s in scale:
            n = int(s) + delta
            if n < 36 or n > 96:
                continue
            d = abs(n - pitch)
            if d < best_d:
                best_d = d
                best = n
    return max(36, min(96, best))


def _scale_neighbors(pitch: int, scale: Tuple[int, ...]) -> List[int]:
    out: List[int] = []
    for delta in range(-24, 25, 12):
        for s in scale:
            n = int(s) + delta
            if 48 <= n <= 84:
                out.append(n)
    return sorted(set(out))


def _break_pitch_run(
    pitch: int,
    run: int,
    break_after: int,
    scale: Tuple[int, ...],
    rng: random.Random,
) -> int:
    if run < break_after or not scale:
        return pitch
    neigh = [n for n in _scale_neighbors(pitch, scale) if n != pitch]
    if not neigh:
        return pitch
    return int(rng.choice(neigh))


def _quantize_beat(t: float, grid: float) -> float:
    if grid <= 0:
        return t
    return max(0.0, round(t / grid) * grid)


def _next_step_beats(st: MusicStyle, rng: random.Random) -> float:
    w = st.rhythm_wobble * st.wobble_step_scale
    raw = st.step_base * (1.0 + w * (rng.random() * 2.0 - 1.0))
    return max(0.08, _quantize_beat(raw, st.quantize_grid))


def _next_dur_bin_for_model(st: MusicStyle, rng: random.Random) -> int:
    """مدخلات مدة للـ LSTM تتبع إحساس الستايل بدل ثابت 0.25 دائماً."""
    lo_b = max(0.1, st.duration_min * 0.35)
    hi_b = min(3.5, max(lo_b + 0.08, st.duration_max * 0.45))
    lo = dur_to_bin(lo_b)
    hi = dur_to_bin(hi_b)
    hi = min(DUR_BINS - 1, max(lo + 1, hi))
    return int(rng.randint(lo, hi))


def _apply_top_p(probs: torch.Tensor, top_p: float) -> torch.Tensor:
    if top_p >= 0.999:
        return probs
    sorted_p, sorted_i = torch.sort(probs, descending=True, dim=-1)
    cum = torch.cumsum(sorted_p, dim=-1)
    mask = cum > top_p
    mask[..., 1:] = mask[..., :-1].clone()
    mask[..., 0] = False
    sorted_p = sorted_p.masked_fill(mask, 0.0)
    s = sorted_p.sum(dim=-1, keepdim=True).clamp(min=1e-8)
    sorted_p = sorted_p / s
    out = torch.zeros_like(probs)
    out.scatter_(-1, sorted_i, sorted_p)
    return out


def load_lstm(ckpt_path: str, device: str):
    """Load checkpoint + model. Pure I/O — heavy enough to deserve caching.

    Returns (model, meta) where meta carries `seq_len`, `use_style`,
    `use_planet`, etc. consumed by `sample_with_model`.
    """
    blob = _torch_load_checkpoint(ckpt_path, device)
    seq_len = int(blob["seq_len"])
    num_styles = int(blob.get("num_styles", 0))
    use_style = bool(blob.get("use_style", False)) or num_styles > 0
    num_planets = int(blob.get("num_planets", 0))
    use_planet = bool(blob.get("use_planet", False)) or num_planets > 0
    model = NoteLSTM(
        num_styles=num_styles if use_style else 0,
        num_planets=num_planets if use_planet else 0,
    ).to(device)
    model.load_state_dict(blob["model"])
    model.eval()
    meta = {
        "seq_len": seq_len,
        "num_styles": num_styles,
        "use_style": use_style,
        "num_planets": num_planets,
        "use_planet": use_planet,
    }
    return model, meta


@torch.no_grad()
def sample_with_model(
    model,
    meta: dict,
    steps: int,
    seed_pitch: int,
    seed_dur_bin: int,
    temperature: float,
    device: str,
    style_idx: int = 0,
    style_id: str = "calm",
    rng: Optional[random.Random] = None,
    top_p: float = 0.92,
    planet_idx: int = 2,
) -> List[int]:
    """Sampling step that accepts a pre-loaded model (cache-friendly)."""
    rng = rng or random.Random(0)
    seq_len = int(meta["seq_len"])
    use_style = bool(meta.get("use_style", False))
    use_planet = bool(meta.get("use_planet", False))

    st = get_style(style_id)
    pitches = [max(0, min(127, seed_pitch))] * seq_len
    durs = [max(0, min(DUR_BINS - 1, seed_dur_bin))] * seq_len
    out_p: List[int] = []
    st_t = torch.tensor([style_idx], dtype=torch.long, device=device)
    pl_i = max(0, min(7, int(planet_idx)))
    pl_t = torch.tensor([pl_i], dtype=torch.long, device=device)
    temp = max(temperature, 0.05)

    for _ in range(steps):
        p_t = torch.tensor([pitches[-seq_len:]], dtype=torch.long, device=device)
        d_t = torch.tensor([durs[-seq_len:]], dtype=torch.long, device=device)
        logits = model(
            p_t,
            d_t,
            st_t if use_style else None,
            pl_t if use_planet else None,
        )[:, -1, :] / temp
        probs = torch.softmax(logits, dim=-1)
        probs = _apply_top_p(probs, top_p)
        nxt = torch.multinomial(probs, 1).item()
        out_p.append(nxt)
        pitches.append(nxt)
        durs.append(_next_dur_bin_for_model(st, rng))
        pitches = pitches[-seq_len:]
        durs = durs[-seq_len:]

    return out_p


def sample(
    ckpt_path: str,
    steps: int,
    seed_pitch: int,
    seed_dur_bin: int,
    temperature: float,
    device: str,
    style_idx: int = 0,
    style_id: str = "calm",
    rng: Optional[random.Random] = None,
    top_p: float = 0.92,
    planet_idx: int = 2,
):
    """Backwards-compatible: loads the checkpoint then samples. Prefer
    `services.lstm_blend.apply_lstm_checkpoint_to_events` in production code
    so the cached model is reused across requests."""
    model, meta = load_lstm(ckpt_path, device)
    return sample_with_model(
        model,
        meta,
        steps,
        seed_pitch,
        seed_dur_bin,
        temperature,
        device,
        style_idx=style_idx,
        style_id=style_id,
        rng=rng,
        top_p=top_p,
        planet_idx=planet_idx,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", default="outputs/lstm_sample.mid")
    ap.add_argument("--steps", type=int, default=80)
    ap.add_argument("--seed-pitch", type=int, default=60)
    ap.add_argument("--style", default="calm", help="calm|pop|study|cinematic (if checkpoint is style-conditioned)")
    ap.add_argument(
        "--planet",
        default="Earth",
        help="Planet name for planet-conditioned checkpoints (Mercury..Neptune)",
    )
    ap.add_argument(
        "--bpm",
        type=int,
        default=None,
        help="MIDI tempo; default = BPM of selected style from music_styles.py",
    )
    ap.add_argument("--temperature", type=float, default=None, help="default: style-specific")
    ap.add_argument("--top-p", type=float, default=None, help="nucleus sampling; default: style-specific")
    ap.add_argument("--seed", type=int, default=42, help="RNG seed for rhythm + anti-repeat")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    style_key = args.style.strip().lower()
    if style_key not in STYLES:
        style_key = "calm"

    blob = _torch_load_checkpoint(args.checkpoint, args.device)
    use_style = bool(blob.get("use_style", False)) or int(blob.get("num_styles", 0)) > 0
    sid = style_name_to_idx(style_key)
    temp = args.temperature if args.temperature is not None else _DEFAULT_TEMP[style_key]
    top_p = args.top_p if args.top_p is not None else _DEFAULT_TOP_P[style_key]

    rng = random.Random(int(args.seed) + sid * 9973)
    pid = planet_name_to_idx(args.planet)
    notes = sample(
        args.checkpoint,
        args.steps,
        args.seed_pitch,
        dur_to_bin(0.35),
        temp,
        args.device,
        style_idx=sid,
        style_id=style_key,
        rng=rng,
        top_p=top_p,
        planet_idx=pid,
    )

    st = get_style(style_key)
    rend = _STYLE_RENDER.get(style_key, _STYLE_RENDER["calm"])
    bpm = st.bpm if args.bpm is None else args.bpm

    midi = MIDIFile(1)
    midi.addTempo(0, 0, int(bpm))
    midi.addProgramChange(0, 0, 0, 0)
    t = 0.0
    prev: Optional[int] = None
    run = 0
    for i, p in enumerate(notes):
        p0 = _snap_pitch_to_scale(int(p), st.scale)
        if prev is None:
            run = 1
        elif p0 == prev:
            run += 1
        else:
            run = 1
        p0 = _break_pitch_run(p0, run, rend["break_after"], st.scale, rng)
        prev = p0

        step = _next_step_beats(st, rng)
        dur_note = step * rend["legato"]
        dur_note = max(0.1, min(dur_note, min(st.duration_max, step * 1.08)))

        vel = int(rend["vel_base"] + rend["vel_spread"] * math.sin(i * 0.37 + sid))
        vel = max(28, min(110, vel))

        midi.addNote(0, 0, p0, t, dur_note, vel)
        t += step

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "wb") as fp:
        midi.writeFile(fp)
    print(
        f"Wrote {args.out} ({len(notes)} notes)  style={style_key if use_style else 'n/a'}  "
        f"temp={temp:.2f} top_p={top_p:.2f}"
    )


if __name__ == "__main__":
    main()
