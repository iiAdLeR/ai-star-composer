# Why it can still sound “cheap” — and how to get a **strong** demo

See also **`docs/WOW_PIPELINE.md`**: automatic `*_hq.wav` via **FluidSynth + SoundFont** when configured.

## What limits automatic sound

1. **Browser demo** uses simple oscillators (sine-like stack). It is only for *testing* the live stream.
2. **Built-in WAV** (`render_events_to_wav`) is improved (ADSR + detuned layers + bass), but it is still *synthetic*, not a full DAW.
3. **MIDI files** have *musical structure*; the **timbre** depends entirely on the **player + soundfont / VST**.

For a graduation defense, the strongest path is:

## Recommended “wow” playback chain

- Open the `.mid` in **MuseScore**, **Reaper**, **FL Studio**, or **GarageBand**.
- Load a good **General MIDI SoundFont** (e.g. FluidR3) or orchestral/pop VSTs.
- Export a **high-quality MP3/WAV** from there for the jury.

### Free stack example

- **MuseScore** import MIDI → assign instruments → export audio.
- Or **FluidSynth** + a `.sf2` file for batch rendering.

## What we improved in code (structure, not just timbre)

- **Bass line** on its own register (`bass_note`).
- **Multi-track MIDI**: melody / bass / harmony (arpeggiated).
- **Rhythmic quantization** per style (`quantize_grid`).
- **Clearer lead** (often +1 octave to avoid mud).
- **Richer offline WAV** (envelopes + partials + separate bass gain).

## If you want the next big jump

- Add **real samples** (SF2) inside Python via `pyfluidsynth` / external FluidSynth (heavier setup).
- Or keep Python for *data + MIDI* and use a **DAW** for the final master (most common in serious projects).
