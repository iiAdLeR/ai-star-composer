import math
import os
import random
import struct
import wave

from services.drum_track import BAR_PATTERNS


def _midi_to_freq(note):
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def _apply_schroeder_reverb(
    signal: list[float],
    sample_rate: int,
    *,
    wet: float = 0.20,
    room_size: float = 0.55,
) -> None:
    """In-place Schroeder reverb.

    Four parallel comb filters feed two cascaded allpass filters; the
    diffuse tail is then mixed back at `wet`.  Operates in pure Python
    on the existing float buffer — fine for ~30-90s renders.  The dry
    signal is preserved at `(1 - wet)` so we never blur the original
    melody beyond recognition.

    `room_size` in [0, 1] scales the comb feedback (larger = longer tail).
    """
    n = len(signal)
    if n < sample_rate // 4:
        return  # too short to bother
    fb = 0.7 + 0.25 * max(0.0, min(1.0, room_size))
    # Comb delays in ms — these are the classic Freeverb numbers re-scaled.
    comb_delays_ms = (29.7, 37.1, 41.1, 43.7)
    allpass_delays_ms = (5.0, 1.7)

    def _comb(buf_len: int):
        return [0.0] * max(1, buf_len)

    combs = [(_comb(int(d * 1e-3 * sample_rate)), 0) for d in comb_delays_ms]
    allpasses = [(_comb(int(d * 1e-3 * sample_rate)), 0) for d in allpass_delays_ms]

    dry_gain = 1.0 - wet * 0.65  # keep original prominent
    wet_gain = wet

    for i in range(n):
        x = signal[i]
        # Parallel comb filters
        y = 0.0
        for j, (cbuf, _) in enumerate(combs):
            pos = combs[j][1]
            delayed = cbuf[pos]
            cbuf[pos] = x + delayed * fb
            combs[j] = (cbuf, (pos + 1) % len(cbuf))
            y += delayed
        y *= 0.25  # average the 4 combs

        # Series allpass filters for diffusion
        for j, (abuf, _) in enumerate(allpasses):
            pos = allpasses[j][1]
            delayed = abuf[pos]
            new_v = y + delayed * 0.5
            abuf[pos] = new_v
            y = delayed - new_v * 0.5
            allpasses[j] = (abuf, (pos + 1) % len(abuf))

        signal[i] = x * dry_gain + y * wet_gain


def _adsr(t: float, duration: float, attack: float, release: float) -> float:
    if duration <= 0:
        return 0.0
    a = min(attack, duration * 0.4)
    r = min(release, duration * 0.5)
    if t < a:
        return t / max(a, 1e-6)
    if t > duration - r:
        return max(0.0, (duration - t) / max(r, 1e-6))
    return 1.0


def _add_synth_kick(signal: list[float], sample_rate: int, t_sec: float, gain: float) -> None:
    start = max(0, int(t_sec * sample_rate))
    n = int(0.11 * sample_rate)
    for i in range(n):
        idx = start + i
        if idx >= len(signal):
            break
        t = i / sample_rate
        freq = 135.0 * math.exp(-t * 38.0)
        env = math.exp(-t * 20.0)
        signal[idx] += gain * env * math.sin(2.0 * math.pi * freq * t)


def _add_synth_snare(signal: list[float], sample_rate: int, t_sec: float, gain: float) -> None:
    start = max(0, int(t_sec * sample_rate))
    n = int(0.055 * sample_rate)
    rng = random.Random(int(t_sec * 7919) % (2**31))
    for i in range(n):
        idx = start + i
        if idx >= len(signal):
            break
        t = i / sample_rate
        env = math.exp(-t * 65.0)
        body = math.sin(2.0 * math.pi * 185.0 * t) * math.exp(-t * 40.0)
        noise = (rng.random() * 2.0 - 1.0) * 0.85
        signal[idx] += gain * env * (noise + body * 0.35)


def _add_synth_tick(
    signal: list[float], sample_rate: int, t_sec: float, gain: float, bright: bool
) -> None:
    start = max(0, int(t_sec * sample_rate))
    n = int((0.022 if bright else 0.035) * sample_rate)
    f0 = 3200.0 if bright else 900.0
    for i in range(n):
        idx = start + i
        if idx >= len(signal):
            break
        t = i / sample_rate
        env = math.exp(-t * (220.0 if bright else 90.0))
        signal[idx] += gain * env * math.sin(2.0 * math.pi * f0 * t)


def _mix_style_drums_wav(
    signal: list[float], sample_rate: int, total_sec: float, style_id: str, bpm: int
) -> None:
    from services.music_styles import resolve_engine_persona

    spb = 60.0 / max(1, int(bpm))
    # The WAV drum synth table only knows base persona keys; birthday
    # styles (e.g. "celebration") are mapped to their persona here so
    # they still get a drum bed in the fallback render path.
    key = resolve_engine_persona(style_id)
    pattern = BAR_PATTERNS.get(key, BAR_PATTERNS["calm"])
    bar_len = 4.0
    b = 0
    while b * bar_len * spb < total_sec:
        base_beat = b * bar_len
        for off, pitch, _dur, vel in pattern:
            t_sec = (base_beat + off) * spb
            if t_sec >= total_sec:
                continue
            v = (max(1, min(127, vel)) / 127.0) ** 0.88
            if pitch in (35, 36, 41, 43):
                _add_synth_kick(signal, sample_rate, t_sec, 0.36 * v)
            elif pitch == 38:
                _add_synth_snare(signal, sample_rate, t_sec, 0.28 * v)
            else:
                _add_synth_tick(signal, sample_rate, t_sec, 0.12 * v, bright=(pitch == 42))
        b += 1


def _add_osc_note(
    signal: list[float],
    sample_rate: int,
    start: int,
    end: int,
    midi_note: int,
    gain: float,
    is_bass: bool,
) -> None:
    freq = _midi_to_freq(midi_note)
    n = max(1, end - start)
    dur_sec = n / sample_rate
    hi = min(end, len(signal))
    for i in range(start, hi):
        rel = (i - start) / sample_rate
        env = _adsr(rel, dur_sec, 0.032 if not is_bass else 0.05, 0.12 if not is_bass else 0.22)
        w = 2.0 * math.pi * freq * rel
        v = 0.48 * math.sin(w) + 0.3 * math.sin(w * 1.006) + 0.14 * math.sin(2.0 * w)
        if is_bass:
            v *= 1.2
        signal[i] += gain * env * v


def _to_mono(samples, n_channels):
    if n_channels == 1:
        return samples
    if n_channels != 2:
        raise ValueError("Only mono/stereo WAV is supported.")
    mono = []
    for i in range(0, len(samples), 2):
        left = samples[i]
        right = samples[i + 1] if i + 1 < len(samples) else left
        mono.append(int((left + right) / 2))
    return mono


def _resample_linear(samples, src_rate, dst_rate):
    if src_rate == dst_rate or not samples:
        return samples
    ratio = dst_rate / src_rate
    out_len = max(1, int(len(samples) * ratio))
    out = []
    for i in range(out_len):
        src_pos = i / ratio
        left_idx = int(src_pos)
        right_idx = min(left_idx + 1, len(samples) - 1)
        frac = src_pos - left_idx
        val = samples[left_idx] * (1.0 - frac) + samples[right_idx] * frac
        out.append(int(val))
    return out


def _read_wav_mono_16(path, target_rate=44100):
    with wave.open(path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        src_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    if sampwidth != 2:
        raise ValueError(f"Only 16-bit WAV is supported: {path}")

    raw = list(struct.unpack("<" + "h" * (len(frames) // 2), frames))
    mono = _to_mono(raw, n_channels)
    mono = _resample_linear(mono, src_rate=src_rate, dst_rate=target_rate)

    return mono, target_rate


def _write_wav_mono_16(samples, output_path, sample_rate=44100):
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<" + "h" * len(samples), *samples))
    return output_path


def _normalize_peak(samples, peak=30000):
    if not samples:
        return samples
    max_abs = max(max(samples), abs(min(samples)), 1)
    scale = peak / max_abs
    return [int(max(-32768, min(32767, s * scale))) for s in samples]


def _apply_fade(samples, sample_rate, fade_ms=80):
    if fade_ms <= 0 or not samples:
        return samples
    fade_n = int((fade_ms / 1000.0) * sample_rate)
    fade_n = min(fade_n, len(samples) // 2)
    if fade_n <= 0:
        return samples
    out = samples[:]
    for i in range(fade_n):
        g = i / fade_n
        out[i] = int(out[i] * g)
        out[-(i + 1)] = int(out[-(i + 1)] * g)
    return out


def render_events_to_wav(
    events,
    output_path,
    bpm: int = 120,
    style_id: str = "calm",
    sample_rate=44100,
    mix_drum_bed: bool = True,
):
    """
    Render note events to WAV. Event `time` and `duration` are in **quarter-note beats**
    (same as MIDI); they are converted to seconds using `bpm`.
    """
    if not events:
        raise ValueError("No note events to render.")

    spb = 60.0 / max(1, int(bpm))

    def _end_sec(ev):
        return (float(ev["time"]) + float(ev["duration"])) * spb

    bar_sec = 4.0 * spb
    total_sec = max(_end_sec(ev) for ev in events) + 0.45 + bar_sec
    total_samples = int(total_sec * sample_rate)
    signal = [0.0] * total_samples
    arp_sec = max(0.04, min(0.09, 0.12 * spb))

    for ev in events:
        layer = ev.get("layer")
        if layer == "pad":
            # Birthday pad event — slow, soft, sustained
            t0_sec = float(ev["time"]) * spb
            dur_sec = float(ev["duration"]) * spb
            vel = max(1, min(127, int(ev.get("velocity", 56))))
            vel_norm = (vel / 127.0) ** 0.85
            start = int(t0_sec * sample_rate)
            end = min(total_samples, int((t0_sec + dur_sec) * sample_rate))
            _add_osc_note(signal, sample_rate, start, end, int(ev["note"]), vel_norm * 0.12, is_bass=False)
            continue
        if layer == "arp":
            t0_sec = float(ev["time"]) * spb
            dur_sec = float(ev["duration"]) * spb
            vel = max(1, min(127, int(ev.get("velocity", 48))))
            vel_norm = (vel / 127.0) ** 0.85
            start = int(t0_sec * sample_rate)
            end = min(total_samples, int((t0_sec + dur_sec) * sample_rate))
            _add_osc_note(signal, sample_rate, start, end, int(ev["note"]), vel_norm * 0.07, is_bass=False)
            continue
        # Default: legacy chord event (melody + lead + bass + harmony).
        t0_sec = float(ev["time"]) * spb
        dur_sec = float(ev["duration"]) * spb
        vel = max(1, min(127, int(ev.get("velocity", 90))))
        vel_norm = (vel / 127.0) ** 0.85

        start = int(t0_sec * sample_rate)
        end = min(total_samples, int((t0_sec + dur_sec) * sample_rate))

        base_gain = vel_norm * 0.22
        _add_osc_note(signal, sample_rate, start, end, int(ev["base_note"]), base_gain, is_bass=False)

        lead_gain = vel_norm * 0.14
        lead_end = min(total_samples, int((t0_sec + dur_sec * 0.55) * sample_rate))
        _add_osc_note(signal, sample_rate, start, lead_end, int(ev["lead_note"]), lead_gain, is_bass=False)

        bass_n = int(ev.get("bass_note", ev["base_note"] - 12))
        bass_gain = vel_norm * 0.26
        _add_osc_note(signal, sample_rate, start, end, bass_n, bass_gain, is_bass=True)

        for hi, h in enumerate(ev.get("harmony", [])):
            h_start = int((t0_sec + hi * arp_sec) * sample_rate)
            h_end = min(total_samples, int((t0_sec + dur_sec * 0.82) * sample_rate))
            hg = vel_norm * 0.09
            _add_osc_note(signal, sample_rate, h_start, h_end, int(h), hg, is_bass=False)

    if mix_drum_bed:
        # `nebula` (birthday) + `drone` (studio) are intentionally drum-less —
        # ask the central registry instead of hard-coding ids here.
        try:
            from services.music_styles import style_has_drums

            has_drums = style_has_drums(style_id)
        except Exception:
            has_drums = (style_id or "").strip().lower() != "nebula"
        if has_drums:
            _mix_style_drums_wav(signal, sample_rate, total_sec, style_id, bpm)

    # Gentle Schroeder-style reverb tail so the WAV fallback no longer
    # sounds like raw sine waves stitched together.  Wet level is
    # intentionally low — FluidSynth (when available) will have already
    # produced the *_hq.wav with proper instruments + reverb; this is
    # only a graceful fallback.
    _apply_schroeder_reverb(signal, sample_rate, wet=0.18)

    max_abs = max(max(signal), abs(min(signal)), 1e-9)
    samples = [int(max(-32768, min(32767, (s / max_abs) * 30000.0))) for s in signal]
    samples = _apply_fade(samples, sample_rate, fade_ms=80)
    return _write_wav_mono_16(samples, output_path, sample_rate=sample_rate)


def mix_with_nasa_background(
    generated_wav,
    background_wav,
    output_path,
    bg_gain=0.35,
    fg_gain=0.85,
    fade_ms=80,
    ducking=True,
    ducking_strength=0.45,
    sample_rate=44100,
):
    if not os.path.exists(background_wav):
        raise FileNotFoundError(f"Background file not found: {background_wav}")

    fg_samples, _ = _read_wav_mono_16(generated_wav, target_rate=sample_rate)
    bg_samples, _ = _read_wav_mono_16(background_wav, target_rate=sample_rate)

    fg_samples = _normalize_peak(fg_samples, peak=28000)
    bg_samples = _normalize_peak(bg_samples, peak=22000)

    size = max(len(fg_samples), len(bg_samples))
    mixed = []
    env_window = int(sample_rate * 0.03)
    env_window = max(1, env_window)
    running_abs = 0.0

    for i in range(size):
        a = fg_samples[i] if i < len(fg_samples) else 0
        b = bg_samples[i] if i < len(bg_samples) else 0

        if ducking:
            current_abs = abs(a) / 32768.0
            running_abs += (current_abs - running_abs) / env_window
            duck_factor = 1.0 - (running_abs * ducking_strength)
            duck_factor = max(0.25, min(1.0, duck_factor))
        else:
            duck_factor = 1.0

        m = int(a * fg_gain + b * bg_gain * duck_factor)
        mixed.append(max(-32768, min(32767, m)))

    mixed = _normalize_peak(mixed, peak=30000)
    mixed = _apply_fade(mixed, sample_rate=sample_rate, fade_ms=fade_ms)
    return _write_wav_mono_16(mixed, output_path, sample_rate=sample_rate)
