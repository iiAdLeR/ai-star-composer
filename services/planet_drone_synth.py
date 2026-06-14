"""
Pure-synthesis "planet drone" renderer.

The `drone` Studio style does NOT route through the chord-event MIDI →
FluidSynth pipeline.  Pads (Halo / Sweep / Choir) are still *melodic*
instruments with audible note attacks, which sounds like "a slow song"
rather than "the planet itself".  Instead, for `drone` we render the WAV
directly from this module — pure additive + subtractive synthesis with
no note onsets.

Per-planet acoustic fingerprint, hand-tuned to feel like the
Voyager/Cassini PWS recordings of magnetosphere emissions (deep growl on
Jupiter, metallic shimmer on Saturn, thin whistles on Mars, ...).  The
NASA orbital `points` stream is folded back in as a slow gain envelope
so the drone "breathes" with the actual ephemeris of that planet over
the requested window.

Signal chain per planet:

  fundamental stack  (3 harmonics, slight detune)         ─┐
  filtered pink-noise (bandpass at center_hz)              ├─► sum
  inharmonic shimmer (2 partials at non-integer ratios)   ─┘
                                                           │
                          ┌────────────────────────────────┘
                          ▼
        velocity envelope from NASA speed_norm
                          │
                          ▼
                 Schroeder reverb tail
                          │
                          ▼
                fade-in / fade-out + 16-bit PCM
"""
from __future__ import annotations

import math
import random
import struct
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional


# ---------------------------------------------------------------------------
# Per-planet acoustic DNA
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class _PlanetSpec:
    fundamental_hz: float       # bass tonic (very low — sub bass)
    noise_center_hz: float      # bandpass center for the atmospheric layer
    noise_q: float              # bandpass selectivity (higher = thinner band)
    lfo_rate_hz: float          # speed of the slow filter sweep
    shimmer_ratio_1: float      # inharmonic partial #1 (× fundamental)
    shimmer_ratio_2: float      # inharmonic partial #2 (× fundamental)
    noise_gain: float           # 0..1 — how much of the spectrum is "wind"
    shimmer_gain: float         # 0..1 — how "alien" / metallic on top
    detune_cents: float         # chorus width on the fundamental stack
    description: str


_PLANETS: dict[str, _PlanetSpec] = {
    # Mercury — no atmosphere; only the solar wind hitting bare rock.
    # → high metallic shimmer, almost no low-end mass.
    "Mercury": _PlanetSpec(
        fundamental_hz=147.0, noise_center_hz=4200.0, noise_q=2.6,
        lfo_rate_hz=0.12, shimmer_ratio_1=2.41, shimmer_ratio_2=3.83,
        noise_gain=0.22, shimmer_gain=0.18, detune_cents=4.0,
        description="thin metallic shimmer, no atmosphere",
    ),
    # Venus — dense CO₂/sulfuric clouds, surface pressure 92×Earth.
    # → heavy mid-low rumble + hiss.
    "Venus": _PlanetSpec(
        fundamental_hz=55.0, noise_center_hz=620.0, noise_q=0.9,
        lfo_rate_hz=0.04, shimmer_ratio_1=2.18, shimmer_ratio_2=4.31,
        noise_gain=0.42, shimmer_gain=0.05, detune_cents=6.0,
        description="dense sulfur-cloud rumble",
    ),
    # Earth — chorus & whistler emissions famously sound "alive".
    "Earth": _PlanetSpec(
        fundamental_hz=82.0, noise_center_hz=1850.0, noise_q=1.4,
        lfo_rate_hz=0.07, shimmer_ratio_1=2.51, shimmer_ratio_2=3.97,
        noise_gain=0.28, shimmer_gain=0.14, detune_cents=5.0,
        description="warm chorus / whistler emissions",
    ),
    # Mars — thin CO₂, dust devils.
    "Mars": _PlanetSpec(
        fundamental_hz=98.0, noise_center_hz=3400.0, noise_q=2.1,
        lfo_rate_hz=0.18, shimmer_ratio_1=2.33, shimmer_ratio_2=3.71,
        noise_gain=0.30, shimmer_gain=0.12, detune_cents=4.5,
        description="thin dusty whistling",
    ),
    # Jupiter — gas giant + most intense radio emissions in the system.
    "Jupiter": _PlanetSpec(
        fundamental_hz=41.0, noise_center_hz=380.0, noise_q=0.7,
        lfo_rate_hz=0.03, shimmer_ratio_1=2.07, shimmer_ratio_2=4.13,
        noise_gain=0.48, shimmer_gain=0.06, detune_cents=7.0,
        description="deep churning growl",
    ),
    # Saturn — Cassini SKR (kilometric radiation): metallic, hauntingly rhythmic.
    "Saturn": _PlanetSpec(
        fundamental_hz=62.0, noise_center_hz=2400.0, noise_q=1.8,
        lfo_rate_hz=0.09, shimmer_ratio_1=2.44, shimmer_ratio_2=3.59,
        noise_gain=0.30, shimmer_gain=0.20, detune_cents=4.0,
        description="metallic ring shimmer",
    ),
    # Uranus — sideways axis, thin ice atmosphere.
    "Uranus": _PlanetSpec(
        fundamental_hz=73.0, noise_center_hz=1400.0, noise_q=1.3,
        lfo_rate_hz=0.11, shimmer_ratio_1=2.27, shimmer_ratio_2=4.07,
        noise_gain=0.26, shimmer_gain=0.10, detune_cents=5.5,
        description="smooth icy whisper",
    ),
    # Neptune — fastest winds in the solar system (~2000 km/h).
    "Neptune": _PlanetSpec(
        fundamental_hz=49.0, noise_center_hz=820.0, noise_q=1.0,
        lfo_rate_hz=0.05, shimmer_ratio_1=2.13, shimmer_ratio_2=3.89,
        noise_gain=0.40, shimmer_gain=0.08, detune_cents=6.5,
        description="deep howling wind",
    ),
}


def _spec_for(planet_name: str) -> _PlanetSpec:
    key = (planet_name or "Earth").strip().capitalize()
    return _PLANETS.get(key, _PLANETS["Earth"])


# ---------------------------------------------------------------------------
# DSP primitives
# ---------------------------------------------------------------------------
def _pink_noise(n: int, seed: int) -> List[float]:
    """Voss-McCartney pink noise — softer high end than white."""
    rng = random.Random(seed)
    num_rows = 16
    rows = [0.0] * num_rows
    running_sum = 0.0
    counter = 0
    out: List[float] = [0.0] * n
    for i in range(n):
        counter += 1
        # Which row changes this sample (the index of the lowest set bit).
        lsb = counter & -counter
        row = (lsb.bit_length() - 1) % num_rows
        new_val = rng.uniform(-1.0, 1.0)
        running_sum += new_val - rows[row]
        rows[row] = new_val
        white = rng.uniform(-1.0, 1.0)
        out[i] = (running_sum + white) / (num_rows + 1)
    return out


def _bandpass_svf_sweep(
    noise: List[float],
    sample_rate: int,
    center_hz_lfo: List[float],
    q: float,
) -> List[float]:
    """State-variable bandpass with sample-rate cutoff modulation.

    `center_hz_lfo[i]` is the desired BPF center frequency for sample i.
    """
    out = [0.0] * len(noise)
    low = 0.0
    band = 0.0
    inv_q = 1.0 / max(0.25, q)
    nyq = 0.49 * sample_rate
    min_cut = 30.0
    for i, x in enumerate(noise):
        cut = center_hz_lfo[i]
        if cut < min_cut:
            cut = min_cut
        if cut > nyq:
            cut = nyq
        f = 2.0 * math.sin(math.pi * cut / sample_rate)
        # Two passes per sample give a steeper response with less alias.
        for _ in range(2):
            low += f * band
            high = x - low - inv_q * band
            band += f * high
        out[i] = band
    return out


def _harmonic_stack(
    n: int,
    sample_rate: int,
    fundamental_hz: float,
    detune_cents: float,
    rng_seed: int,
) -> List[float]:
    """Three sine partials (1×, 2×, 3×) with random per-partial phase + detune."""
    rng = random.Random(rng_seed)
    p1 = rng.uniform(0.0, 2.0 * math.pi)
    p2 = rng.uniform(0.0, 2.0 * math.pi)
    p3 = rng.uniform(0.0, 2.0 * math.pi)
    detune = 2.0 ** (detune_cents / 1200.0)  # cents → ratio
    out = [0.0] * n
    inv_sr = 1.0 / sample_rate
    f1 = fundamental_hz
    f2 = 2.0 * fundamental_hz * detune
    f3 = 3.0 * fundamental_hz / detune
    for i in range(n):
        t = i * inv_sr
        s1 = math.sin(2.0 * math.pi * f1 * t + p1) * 0.55
        s2 = math.sin(2.0 * math.pi * f2 * t + p2) * 0.27
        s3 = math.sin(2.0 * math.pi * f3 * t + p3) * 0.13
        out[i] = s1 + s2 + s3
    return out


def _inharmonic_shimmer(
    n: int,
    sample_rate: int,
    fundamental_hz: float,
    ratio_a: float,
    ratio_b: float,
    rng_seed: int,
) -> List[float]:
    """Two non-integer-ratio sines with very slow tremolo (independent LFOs)."""
    rng = random.Random(rng_seed)
    pa = rng.uniform(0.0, 2.0 * math.pi)
    pb = rng.uniform(0.0, 2.0 * math.pi)
    lfa = 0.07 + rng.random() * 0.05   # ~ 0.07-0.12 Hz
    lfb = 0.11 + rng.random() * 0.06   # ~ 0.11-0.17 Hz
    fa = fundamental_hz * ratio_a
    fb = fundamental_hz * ratio_b
    out = [0.0] * n
    inv_sr = 1.0 / sample_rate
    for i in range(n):
        t = i * inv_sr
        # Slow AM (tremolo) so the shimmer fades in and out.
        ga = 0.5 + 0.5 * math.sin(2.0 * math.pi * lfa * t)
        gb = 0.5 + 0.5 * math.sin(2.0 * math.pi * lfb * t)
        sa = math.sin(2.0 * math.pi * fa * t + pa) * ga * 0.6
        sb = math.sin(2.0 * math.pi * fb * t + pb) * gb * 0.4
        out[i] = sa + sb
    return out


def _build_lfo(
    n: int,
    sample_rate: int,
    rate_hz: float,
    center: float,
    swing: float,
) -> List[float]:
    """Sine LFO around `center`, peak-to-peak swing = 2*swing."""
    out = [0.0] * n
    inv_sr = 1.0 / sample_rate
    for i in range(n):
        out[i] = center + swing * math.sin(2.0 * math.pi * rate_hz * i * inv_sr)
    return out


def _breathing_envelope(
    n: int,
    points: Optional[List[dict]],
    smoothing_samples: int,
    floor: float = 0.55,
    ceiling: float = 1.0,
) -> List[float]:
    """Slow gain ramp derived from `speed_norm` in the NASA points stream.

    Values are interpolated linearly across the audio buffer and then
    smoothed with a one-pole low-pass so the gain doesn't jump on day
    boundaries.  Falls back to a constant gain when no points are given.
    """
    if not points:
        return [ceiling] * n
    raw: List[float] = []
    for p in points:
        v = p.get("speed_norm")
        if v is None:
            v = p.get("speed", 0.5)
        try:
            raw.append(max(0.0, min(1.0, float(v))))
        except (TypeError, ValueError):
            raw.append(0.5)
    if not raw:
        return [ceiling] * n
    span = max(1, len(raw) - 1)
    out = [0.0] * n
    for i in range(n):
        # Map sample i to a fractional index in `raw`.
        x = i * span / max(1, n - 1)
        lo = int(math.floor(x))
        hi = min(lo + 1, span)
        frac = x - lo
        v = raw[lo] * (1.0 - frac) + raw[hi] * frac
        out[i] = floor + (ceiling - floor) * v
    # Single-pole IIR smoothing — long time constant so day boundaries melt.
    a = 1.0 / max(2, smoothing_samples)
    prev = out[0]
    for i in range(1, n):
        prev = prev + a * (out[i] - prev)
        out[i] = prev
    return out


def _schroeder_reverb(
    signal: List[float],
    sample_rate: int,
    *,
    wet: float = 0.32,
    room: float = 0.62,
) -> None:
    """In-place reverb tail — same structure as the WAV-fallback synth.

    The drone needs a longer, wetter tail than the birthday synth so it
    feels like the planet has *space* around it.
    """
    n = len(signal)
    comb_delays_ms = (29.7, 37.1, 41.3, 43.7)
    comb_buffers: list[list[float]] = []
    comb_indices: list[int] = []
    feedback: list[float] = []
    for d in comb_delays_ms:
        L = max(4, int(d * 1e-3 * sample_rate))
        comb_buffers.append([0.0] * L)
        comb_indices.append(0)
        feedback.append(0.78 + 0.18 * room)
    allpass_delays_ms = (5.0, 1.7)
    ap_buffers: list[list[float]] = []
    ap_indices: list[int] = []
    for d in allpass_delays_ms:
        L = max(4, int(d * 1e-3 * sample_rate))
        ap_buffers.append([0.0] * L)
        ap_indices.append(0)
    ap_gain = 0.55
    dry = 1.0 - wet
    for i in range(n):
        x = signal[i]
        y_comb = 0.0
        for k in range(len(comb_buffers)):
            buf = comb_buffers[k]
            idx = comb_indices[k]
            delayed = buf[idx]
            new_val = x + delayed * feedback[k]
            buf[idx] = new_val
            comb_indices[k] = (idx + 1) % len(buf)
            y_comb += delayed
        y_comb *= 0.25
        for k in range(len(ap_buffers)):
            buf = ap_buffers[k]
            idx = ap_indices[k]
            delayed = buf[idx]
            new_val = y_comb + delayed * ap_gain
            buf[idx] = new_val
            y_comb = delayed - new_val * ap_gain
            ap_indices[k] = (idx + 1) % len(buf)
        signal[i] = dry * x + wet * y_comb


def _apply_fade(signal: List[float], sample_rate: int, sec: float) -> None:
    """Linear in-place fade-in + fade-out — kills the sub-bass click on start."""
    n = len(signal)
    fade = max(1, int(sec * sample_rate))
    fade = min(fade, n // 3)
    for i in range(fade):
        g = i / fade
        signal[i] *= g
        signal[n - 1 - i] *= g


def _normalize_peak(signal: List[float], peak: float = 0.92) -> None:
    """Peak-normalize to `peak` ∈ (0,1) to leave headroom for clipping."""
    m = 0.0
    for s in signal:
        a = -s if s < 0 else s
        if a > m:
            m = a
    if m < 1e-9:
        return
    g = peak / m
    for i in range(len(signal)):
        signal[i] *= g


def _write_wav_mono(path: str, signal: List[float], sample_rate: int) -> None:
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        clip = 32767
        for s in signal:
            v = int(max(-1.0, min(1.0, s)) * clip)
            frames += struct.pack("<h", v)
        wf.writeframes(bytes(frames))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def estimate_drone_duration_sec(
    events: Optional[List[dict]],
    bpm: int,
    fallback_sec: float = 90.0,
    *,
    min_sec: float = 30.0,
    max_sec: float = 150.0,
) -> float:
    """Pick a sensible duration for the drone.

    We don't want to render half-hour files when the user asks for 90
    days of data, but we also don't want a 20-second clip when they
    asked for a year.  The chord events' total span at the style BPM is
    a good proxy for "how much listening did the user expect?", so we
    use that, clamped to ``[min_sec, max_sec]``.
    """
    if events:
        try:
            end_beats = max(float(e["time"]) + float(e["duration"]) for e in events)
            sec_per_beat = 60.0 / max(20, bpm)
            sec = end_beats * sec_per_beat
            return max(min_sec, min(max_sec, sec + 4.0))  # +4s reverb tail
        except (KeyError, TypeError, ValueError):
            pass
    return max(min_sec, min(max_sec, fallback_sec))


def synthesize_planet_drone(
    planet_name: str,
    duration_sec: float,
    points: Optional[List[dict]] = None,
    seed: int = 42,
    sample_rate: int = 44100,
) -> List[float]:
    """Render `duration_sec` of pure-synthesis planet drone (mono PCM)."""
    spec = _spec_for(planet_name)
    n = max(int(sample_rate * 0.5), int(sample_rate * duration_sec))

    # 1) Fundamental harmonic stack — the planet's "body".
    base = _harmonic_stack(
        n, sample_rate, spec.fundamental_hz, spec.detune_cents, seed
    )

    # 2) Pink noise → time-varying bandpass = the "atmosphere" / wind.
    pink = _pink_noise(n, seed + 7919)
    lfo_cut = _build_lfo(
        n, sample_rate,
        rate_hz=spec.lfo_rate_hz,
        center=spec.noise_center_hz,
        swing=spec.noise_center_hz * 0.35,
    )
    bp = _bandpass_svf_sweep(pink, sample_rate, lfo_cut, spec.noise_q)

    # 3) Inharmonic shimmer — the "alien overtones" floating on top.
    shimmer = _inharmonic_shimmer(
        n, sample_rate, spec.fundamental_hz,
        spec.shimmer_ratio_1, spec.shimmer_ratio_2, seed + 3001,
    )

    # 4) Mix in fixed proportions tuned per planet.
    out = [0.0] * n
    for i in range(n):
        out[i] = (
            base[i] * 0.62
            + bp[i] * (spec.noise_gain * 1.4)
            + shimmer[i] * spec.shimmer_gain
        )

    # 5) Breathing envelope from NASA orbital speed.  Smooth over ~3 seconds
    #    so day-boundary jumps in the data fade into a slow swell.
    env = _breathing_envelope(n, points, smoothing_samples=int(sample_rate * 3.0))
    for i in range(n):
        out[i] *= env[i]

    # 6) Reverb tail (lots of space) + fade in/out.
    _schroeder_reverb(out, sample_rate, wet=0.34, room=0.68)
    _apply_fade(out, sample_rate, sec=2.0)
    _normalize_peak(out, peak=0.88)
    return out


def render_planet_drone_wav(
    out_path: str,
    planet_name: str,
    *,
    duration_sec: float,
    points: Optional[List[dict]] = None,
    seed: int = 42,
    sample_rate: int = 44100,
) -> str:
    """Synthesize + write a planet-drone WAV.  Returns the resolved path."""
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    signal = synthesize_planet_drone(
        planet_name,
        duration_sec=duration_sec,
        points=points,
        seed=seed,
        sample_rate=sample_rate,
    )
    _write_wav_mono(out_path, signal, sample_rate)
    return out_path


def drone_signature(planet_name: str) -> dict[str, Any]:
    """Surface the per-planet acoustic DNA to the API response so clients
    can show "Mercury → 147 Hz / metallic shimmer" badges in the UI."""
    spec = _spec_for(planet_name)
    return {
        "fundamental_hz": round(spec.fundamental_hz, 1),
        "noise_center_hz": round(spec.noise_center_hz, 0),
        "description": spec.description,
    }
