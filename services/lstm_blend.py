"""
Optional LSTM melody blend after symbolic `generate_events` (the full
arrangement stays untouched: bass, harmony, drums, timing, velocity).

In-process model cache
----------------------
`apply_lstm_checkpoint_to_events` used to call `torch.load` + rebuild the
model + `load_state_dict` on **every** request. On a CPU that costs ~1-3
seconds of latency we now pay only on the first request after server boot
(or after the checkpoint file changes on disk).

The cache key is `(canonical_path, mtime, device)`. If you replace the .pt
file the cache invalidates automatically — no restart required.
"""
from __future__ import annotations

import logging
import os
import random
import threading
from typing import Any, Dict, List, Optional, Tuple

from services.harmony_engine import blend_lstm_pitches_into_events

logger = logging.getLogger("ai_star_composer.lstm")

_LSTM_CACHE: Dict[Tuple[str, float, str], Tuple[Any, Dict[str, Any]]] = {}
_LSTM_CACHE_LOCK = threading.Lock()


def _cache_key(path: str, device: str) -> Tuple[str, float, str]:
    abs_path = os.path.abspath(path)
    mtime = os.path.getmtime(abs_path)
    return (abs_path, mtime, device)


def _get_cached_model(path: str, device: str):
    """Return (model, meta) from the in-process cache, loading if missing."""
    key = _cache_key(path, device)
    with _LSTM_CACHE_LOCK:
        cached = _LSTM_CACHE.get(key)
    if cached is not None:
        logger.debug("LSTM cache hit %s", key)
        return cached
    from ml.generate_from_lstm import load_lstm

    model, meta = load_lstm(path, device)
    with _LSTM_CACHE_LOCK:
        # Drop older entries for the same file (different mtime / device).
        for k in list(_LSTM_CACHE.keys()):
            if k[0] == key[0] and k != key:
                _LSTM_CACHE.pop(k, None)
        _LSTM_CACHE[key] = (model, meta)
    logger.info("LSTM loaded into cache: %s (device=%s)", path, device)
    return model, meta


def clear_lstm_cache() -> int:
    """Drop every cached model (test/admin helper). Returns removed count."""
    with _LSTM_CACHE_LOCK:
        n = len(_LSTM_CACHE)
        _LSTM_CACHE.clear()
    return n


def apply_lstm_checkpoint_to_events(
    events: List[Dict[str, Any]],
    points: List[Dict[str, Any]],
    style_id: str,
    seed: int,
    checkpoint_path: str,
    device: str = "cpu",
    temperature: float = 0.92,
    planet_name: str = "Earth",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Returns (possibly new event list, meta).

    On any failure (missing file, torch missing, etc.) the original events
    are returned untouched so the pipeline degrades gracefully.
    """
    meta: Dict[str, Any] = {"applied": False}
    path = (checkpoint_path or "").strip()
    if not path or not os.path.isfile(path):
        meta["reason"] = "checkpoint_missing"
        return events, meta

    n_ev = len(events)
    n_pt = len(points)
    n = min(n_ev, n_pt)
    if n < 4:
        meta["reason"] = "too_few_events"
        return events, meta

    try:
        import torch  # noqa: F401  (probe — fail fast if torch is missing)
    except ImportError:
        meta["reason"] = "torch_missing"
        return events, meta

    try:
        from ml.generate_from_lstm import (
            planet_name_to_idx,
            sample_with_model,
            style_name_to_idx,
        )
        from ml.train_sequence_lstm import dur_to_bin
    except ImportError as exc:
        meta["reason"] = f"import:{exc}"
        return events, meta

    # Deterministic seeding across torch + numpy + python random.
    try:
        import numpy as np  # noqa: F401
        import torch  # noqa: F811

        torch.manual_seed(int(seed) & 0xFFFFFFFF)
        np.random.seed(int(seed) & 0xFFFFFFFF)
    except Exception:
        pass

    try:
        model, model_meta = _get_cached_model(path, device)
    except Exception as exc:
        logger.exception("LSTM load failed for %s", path)
        meta["reason"] = f"load_failed:{exc}"
        return events, meta

    sid = style_name_to_idx(style_id, num_styles=int(model_meta.get("num_styles", 0)))
    rng = random.Random(seed % (2**32))
    try:
        pitches = sample_with_model(
            model,
            model_meta,
            n,
            60,
            dur_to_bin(0.35),
            temperature,
            device,
            style_idx=sid,
            style_id=style_id.lower(),
            rng=rng,
            planet_idx=planet_name_to_idx(planet_name),
        )
    except Exception as exc:
        logger.exception("LSTM sampling failed")
        meta["reason"] = f"sample_failed:{exc}"
        return events, meta

    out = [dict(e) for e in events]
    blend_lstm_pitches_into_events(
        out[:n], points[:n], pitches, style_id.lower(), seed, planet_name=planet_name
    )
    meta.update(
        {
            "applied": True,
            "blended_steps": n,
            "checkpoint": path,
            "temperature": temperature,
            "device": device,
        }
    )
    return out, meta


def resolve_lstm_path(explicit: Optional[str], settings_path: Optional[str]) -> str:
    for p in (explicit, settings_path, os.getenv("LSTM_CHECKPOINT_PATH", "")):
        s = (p or "").strip()
        if s and os.path.isfile(s):
            return s
    return ""
