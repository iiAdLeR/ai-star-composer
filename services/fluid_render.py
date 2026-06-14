"""
High-quality MIDI -> WAV using FluidSynth + a SoundFont (.sf2).

Requires `fluidsynth` on PATH (or FLUIDSYNTH_BIN) and a .sf2 file (SOUNDFONT_PATH).
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple


def fluidsynth_executable(bin_name: str = "fluidsynth") -> Optional[str]:
    which = shutil.which(bin_name)
    if which:
        return which
    if os.name == "nt" and not bin_name.lower().endswith(".exe"):
        return shutil.which(bin_name + ".exe")
    return None


def render_midi_to_wav(
    midi_path: str,
    out_wav: str,
    soundfont_path: str,
    fluidsynth_bin: str = "fluidsynth",
    sample_rate: int = 44100,
    timeout_sec: int = 180,
) -> Tuple[bool, str]:
    """
    Returns (ok, error_message). On success error_message is empty.
    """
    mid = Path(midi_path)
    sf2 = Path(soundfont_path)
    if not mid.is_file():
        return False, f"MIDI not found: {midi_path}"
    if not sf2.is_file():
        return False, f"SoundFont not found: {soundfont_path}"

    fs = fluidsynth_executable(fluidsynth_bin) or fluidsynth_bin
    if not Path(fs).is_file() and shutil.which(fs) is None:
        return False, f"FluidSynth not found (set FLUIDSYNTH_BIN or install fluidsynth): {fluidsynth_bin}"

    out = Path(out_wav)
    out.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        fs,
        "-ni",
        "-F",
        str(out.resolve()),
        "-r",
        str(sample_rate),
        "-g",
        "0.6",
        "-R",
        "1",
        "-C",
        "1",
        str(sf2.resolve()),
        str(mid.resolve()),
    ]
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            creationflags=creationflags,
        )
    except FileNotFoundError:
        return False, "FluidSynth executable not found."
    except subprocess.TimeoutExpired:
        return False, "FluidSynth timed out."

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip() or f"exit {proc.returncode}"
        return False, err[:2000]
    if not out.is_file() or out.stat().st_size < 100:
        return False, "FluidSynth produced no valid WAV file."
    return True, ""
