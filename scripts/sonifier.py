import os
from typing import Any, Dict, List, Literal, Tuple

from midiutil import MIDIFile

from services.drum_track import iter_drum_midi_events
from services.harmony_engine import Mode, compute_sonification_metrics, generate_events
from services.music_styles import get_style, style_has_drums

# Tracks 0..3 are the original arrangement (melody/bass/harmony/drums).
# Tracks 4..5 are birthday-only enrichment layers (pad/arp) emitted by
# `services.birthday_arrangement.apply_birthday_arrangement`.  When the
# birthday layer is absent those tracks stay empty so the file size /
# Studio behaviour is unchanged.
NUM_TRACKS = 6
_TRACK_PAD = 4
_TRACK_ARP = 5
_CH_PAD = 4
_CH_ARP = 5

# GM channels reserved per logical role
_CH_MELODY = 0
_CH_BASS = 1
_CH_HARMONY = 2
_CH_DRUMS = 9


def _suppress_drums(style_id: str) -> bool:
    """Single source of truth: `nebula` (birthday) + `drone` (studio) are drum-less."""
    return not style_has_drums(style_id)


def _write_symphony_midi(events: List[Dict[str, Any]], style, planet_name: str = "Earth") -> MIDIFile:
    # Keep note ordering as inserted; avoids rare deinterleave stack underflow on dense overlaps.
    midi = MIDIFile(NUM_TRACKS, deinterleave=False)
    midi.addTempo(0, 0, style.bpm)
    # Per-style General-MIDI instrument trio. Studio styles keep their
    # historical default (piano / electric-bass / strings) via the
    # MusicStyle dataclass defaults, while birthday styles override these
    # to e.g. music-box + acoustic-bass + warm-pad for `tender`.
    midi.addProgramChange(0, _CH_MELODY, 0, int(getattr(style, "program_lead", 0)))
    midi.addProgramChange(1, _CH_BASS, 0, int(getattr(style, "program_bass", 33)))
    midi.addProgramChange(2, _CH_HARMONY, 0, int(getattr(style, "program_harmony", 49)))
    arp_step = 0.09

    # Split the events into the legacy "chord" events and the optional
    # birthday `pad`/`arp` enrichment layers.
    chord_events = [ev for ev in events if "layer" not in ev]
    pad_events = [ev for ev in events if ev.get("layer") == "pad"]
    arp_events = [ev for ev in events if ev.get("layer") == "arp"]

    for ev in chord_events:
        t = float(ev["time"])
        dur = float(ev["duration"])
        vel = int(ev["velocity"])
        pan = int(ev["pan"])
        bass = int(ev.get("bass_note", ev["base_note"] - 12))
        midi.addControllerEvent(0, _CH_MELODY, t, 10, pan)
        midi.addNote(0, _CH_MELODY, ev["base_note"], t, dur, vel)
        lead_dur = max(0.12, min(dur * 0.5, dur - 0.04))
        midi.addNote(0, _CH_MELODY, ev["lead_note"], t, lead_dur, max(32, vel - 22))
        bass_vel = min(100, max(42, vel + 8))
        midi.addNote(1, _CH_BASS, bass, t, min(dur * 1.15, dur + 0.35), bass_vel)
        for hi, h_note in enumerate(ev.get("harmony", [])):
            h_t = t + hi * arp_step
            h_dur = max(0.18, dur * 0.75 - hi * 0.04)
            midi.addNote(2, _CH_HARMONY, int(h_note), h_t, h_dur, max(22, vel - 38))

    # Pad layer — one program change per file (uses the first pad's program).
    if pad_events:
        midi.addProgramChange(_TRACK_PAD, _CH_PAD, 0, int(pad_events[0].get("program", 89)))
        for pe in pad_events:
            midi.addNote(
                _TRACK_PAD,
                _CH_PAD,
                int(pe["note"]),
                float(pe["time"]),
                max(0.2, float(pe["duration"])),
                max(20, min(110, int(pe.get("velocity", 56)))),
            )

    # Arpeggio layer.
    if arp_events:
        midi.addProgramChange(_TRACK_ARP, _CH_ARP, 0, int(arp_events[0].get("program", 11)))
        for ae in arp_events:
            midi.addNote(
                _TRACK_ARP,
                _CH_ARP,
                int(ae["note"]),
                float(ae["time"]),
                max(0.08, float(ae["duration"])),
                max(15, min(100, int(ae.get("velocity", 48)))),
            )

    end_beat = (
        max(float(ev["time"]) + float(ev["duration"]) for ev in events) if events else 4.0
    )
    if not _suppress_drums(style.id):
        for t_d, pitch, d_d, v_d in iter_drum_midi_events(style.id, end_beat, planet_name):
            midi.addNote(3, _CH_DRUMS, pitch, t_d, max(0.04, d_d), v_d)
    return midi


def save_symphony_midi_from_events(
    events: List[Dict[str, Any]],
    planet_name: str,
    style_id: str,
    outputs_dir: str = "outputs",
    filename_suffix: str = "symphony",
) -> str:
    """Write multi-track MIDI (piano/bass/strings + drums) from pre-built event list."""
    os.makedirs(outputs_dir, exist_ok=True)
    style = get_style(style_id)
    midi = _write_symphony_midi(events, style, planet_name)
    out_path = os.path.join(outputs_dir, f"{planet_name.lower()}_{filename_suffix}.mid")
    with open(out_path, "wb") as fp:
        midi.writeFile(fp)
    return out_path


def generate_note_events(
    points: List[Dict[str, Any]],
    seed: int = 42,
    mode: Mode = "ai",
    style_id: str = "calm",
    planet_name: str = "Earth",
) -> List[Dict[str, Any]]:
    return generate_events(
        points, mode=mode, style_id=style_id, seed=seed, planet_name=planet_name
    )


def save_advanced_composition(
    points: List[Dict[str, Any]],
    planet_name: str,
    outputs_dir: str = "outputs",
    seed: int = 42,
    mode: Mode = "ai",
    style_id: str = "calm",
) -> Tuple[str, List[Dict[str, Any]]]:
    os.makedirs(outputs_dir, exist_ok=True)
    style = get_style(style_id)
    events = generate_events(
        points, mode=mode, style_id=style_id, seed=seed, planet_name=planet_name
    )
    midi = _write_symphony_midi(events, style, planet_name)

    suffix = f"{mode}_{style.id}"
    out_path = os.path.join(outputs_dir, f"{planet_name.lower()}_{suffix}_symphony.mid")
    with open(out_path, "wb") as fp:
        midi.writeFile(fp)
    return out_path, events
