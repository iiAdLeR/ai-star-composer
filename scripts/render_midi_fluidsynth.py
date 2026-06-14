"""
CLI: render a MIDI file to WAV using FluidSynth + SoundFont.

Usage:
  python scripts/render_midi_fluidsynth.py path/to/file.mid path/to/out.wav path/to/font.sf2

Or set SOUNDFONT_PATH and omit the third argument.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from services.fluid_render import render_midi_to_wav


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: python scripts/render_midi_fluidsynth.py <input.mid> <output.wav> [soundfont.sf2]"
        )
        sys.exit(1)
    mid = sys.argv[1]
    out = sys.argv[2]
    sf2 = sys.argv[3] if len(sys.argv) > 3 else os.getenv("SOUNDFONT_PATH", "")
    if not sf2:
        print("Provide SoundFont path as 3rd arg or set SOUNDFONT_PATH in .env")
        sys.exit(1)
    bin_name = os.getenv("FLUIDSYNTH_BIN", "fluidsynth")
    ok, err = render_midi_to_wav(mid, out, sf2, fluidsynth_bin=bin_name)
    if not ok:
        print("Failed:", err)
        sys.exit(2)
    print("OK:", out)


if __name__ == "__main__":
    main()
