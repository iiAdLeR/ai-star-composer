import random
from typing import Dict, List, Literal, Optional

from scripts.data_fetcher import fetch_or_load_dataset
from scripts.sonifier import generate_note_events
from services.harmony_engine import _nearest_scale_note
from services.music_styles import get_style

StreamMode = Literal["baseline", "ai"]


def _avoid_immediate_repetition(
    events: List[Dict], style_id: str = "calm", seed: int = 42
):
    """Break identical consecutive melody notes using scale-aware steps.

    Uses a *local* `random.Random(seed)` so the live stream stays reproducible
    for the same seed — relied on by the thesis evaluation section.
    """
    if not events:
        return events

    scale = get_style(style_id).scale
    rng = random.Random(seed)
    out = []
    last_base = None
    for ev in events:
        new_ev = dict(ev)
        base = int(new_ev["base_note"])
        if last_base is not None and base == last_base:
            step = rng.choice((-2, 2, 3, -3))
            new_base = _nearest_scale_note(base + step, scale)
            new_base = max(48, min(84, new_base))
            delta = new_base - base
            new_ev["base_note"] = new_base
            new_ev["lead_note"] = max(48, min(84, int(new_ev["lead_note"]) + delta))
            new_ev["harmony"] = [max(48, min(96, int(h) + delta)) for h in new_ev.get("harmony", [])]
            try:
                new_ev["bass_note"] = int(new_ev.get("bass_note", new_base - 12)) + delta
            except (TypeError, ValueError):
                new_ev["bass_note"] = max(28, min(58, new_base - 12))
        out.append(new_ev)
        last_base = int(new_ev["base_note"])
    return out


def build_live_event_stream(
    planet: str,
    days: int = 60,
    seed: int = 42,
    mode: StreamMode = "ai",
    style_id: str = "calm",
    lstm_checkpoint_path: Optional[str] = None,
    lstm_device: str = "cpu",
    lstm_temperature: float = 0.92,
    data_dir: str = "data",
):
    dataset, _data_path, _cached = fetch_or_load_dataset(
        planet_name=planet, days_count=days, data_dir=data_dir
    )
    points = dataset.get("points", [])
    events = generate_note_events(
        points, seed=seed, mode=mode, style_id=style_id, planet_name=planet
    )
    if lstm_checkpoint_path and mode == "ai":
        from services.lstm_blend import apply_lstm_checkpoint_to_events

        events, _ = apply_lstm_checkpoint_to_events(
            events,
            points,
            style_id,
            seed,
            lstm_checkpoint_path,
            device=lstm_device,
            planet_name=planet,
            temperature=lstm_temperature,
        )
    if mode == "ai":
        events = _avoid_immediate_repetition(events, style_id, seed=seed)
    return dataset, events
