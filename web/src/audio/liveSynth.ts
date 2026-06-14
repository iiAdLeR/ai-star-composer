import type { StyleId } from "@/lib/api";

export type LiveNoteEvent = {
  base_note?: number;
  lead_note?: number;
  bass_note?: number;
  harmony?: number[];
  duration?: number;
  velocity?: number;
  pan?: number;
  speed?: number;
  radius?: number;
  radial_velocity?: number;
  style?: string;
  [key: string]: unknown;
};

function midiToFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

type Osc = OscillatorType;

type LayerKey = "base" | "lead" | "bass" | "harmony";

type LayerCfg = {
  osc: Osc;
  filterHz: number | null;
  detuneCents: number;
  attackSec: number;
  relMul: number;
  velScale: number;
};

type StyleSynthPreset = {
  layers: Record<LayerKey, LayerCfg>;
  harmonyStaggerMs: number;
};

const STYLE_PRESETS: Record<StyleId, StyleSynthPreset> = {
  calm: {
    harmonyStaggerMs: 88,
    layers: {
      base: {
        osc: "triangle",
        filterHz: 2200,
        detuneCents: 0,
        attackSec: 0.07,
        relMul: 1.05,
        velScale: 0.9,
      },
      lead: {
        osc: "sine",
        filterHz: 2800,
        detuneCents: 0,
        attackSec: 0.06,
        relMul: 0.95,
        velScale: 0.72,
      },
      bass: {
        osc: "triangle",
        filterHz: 420,
        detuneCents: 0,
        attackSec: 0.09,
        relMul: 1.12,
        velScale: 0.88,
      },
      harmony: {
        osc: "sine",
        filterHz: 1600,
        detuneCents: 0,
        attackSec: 0.08,
        relMul: 0.9,
        velScale: 0.38,
      },
    },
  },
  pop: {
    harmonyStaggerMs: 52,
    layers: {
      base: {
        osc: "triangle",
        filterHz: 5200,
        detuneCents: -4,
        attackSec: 0.006,
        relMul: 0.88,
        velScale: 1.05,
      },
      lead: {
        osc: "triangle",
        filterHz: 6200,
        detuneCents: 7,
        attackSec: 0.005,
        relMul: 0.82,
        velScale: 0.68,
      },
      bass: {
        osc: "sawtooth",
        filterHz: 360,
        detuneCents: 0,
        attackSec: 0.008,
        relMul: 0.95,
        velScale: 0.92,
      },
      harmony: {
        osc: "triangle",
        filterHz: 4200,
        detuneCents: 3,
        attackSec: 0.006,
        relMul: 0.85,
        velScale: 0.36,
      },
    },
  },
  study: {
    harmonyStaggerMs: 115,
    layers: {
      base: {
        osc: "sine",
        filterHz: 1100,
        detuneCents: 0,
        attackSec: 0.16,
        relMul: 1.18,
        velScale: 0.72,
      },
      lead: {
        osc: "sine",
        filterHz: 1300,
        detuneCents: 0,
        attackSec: 0.14,
        relMul: 1.05,
        velScale: 0.48,
      },
      bass: {
        osc: "sine",
        filterHz: 260,
        detuneCents: 0,
        attackSec: 0.18,
        relMul: 1.22,
        velScale: 0.68,
      },
      harmony: {
        osc: "sine",
        filterHz: 900,
        detuneCents: 0,
        attackSec: 0.15,
        relMul: 1.0,
        velScale: 0.3,
      },
    },
  },
  cinematic: {
    harmonyStaggerMs: 68,
    layers: {
      base: {
        osc: "sawtooth",
        filterHz: 1050,
        detuneCents: -2,
        attackSec: 0.045,
        relMul: 1.0,
        velScale: 1.0,
      },
      lead: {
        osc: "triangle",
        filterHz: 2600,
        detuneCents: 5,
        attackSec: 0.035,
        relMul: 0.92,
        velScale: 0.62,
      },
      bass: {
        osc: "triangle",
        filterHz: 300,
        detuneCents: 0,
        attackSec: 0.05,
        relMul: 1.08,
        velScale: 0.98,
      },
      harmony: {
        osc: "sawtooth",
        filterHz: 1900,
        detuneCents: -3,
        attackSec: 0.04,
        relMul: 0.88,
        velScale: 0.4,
      },
    },
  },
  // `drone` mirrors the Python preset: slow attacks, long releases, gentle
  // low-passing, faint detune chorus on the harmony so the live page also
  // feels like an actual planetary ambient recording instead of a synth lead.
  drone: {
    harmonyStaggerMs: 220,
    layers: {
      base: {
        osc: "sine",
        filterHz: 1400,
        detuneCents: 0,
        attackSec: 0.55,
        relMul: 1.8,
        velScale: 0.78,
      },
      lead: {
        osc: "triangle",
        filterHz: 2400,
        detuneCents: 0,
        attackSec: 0.62,
        relMul: 1.7,
        velScale: 0.48,
      },
      bass: {
        osc: "sine",
        filterHz: 220,
        detuneCents: 0,
        attackSec: 0.78,
        relMul: 2.0,
        velScale: 0.86,
      },
      harmony: {
        osc: "triangle",
        filterHz: 1200,
        detuneCents: 7,
        attackSec: 0.7,
        relMul: 1.85,
        velScale: 0.34,
      },
    },
  },
};

function normalizeStyle(s: string | undefined): StyleId {
  const k = (s || "calm").toLowerCase();
  if (
    k === "calm" ||
    k === "pop" ||
    k === "study" ||
    k === "cinematic" ||
    k === "drone"
  )
    return k;
  return "calm";
}

export class LiveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.85;
  private activeStyle: StyleId = "calm";

  setActiveStyle(style: string): void {
    this.activeStyle = normalizeStyle(style);
  }

  getActiveStyle(): StyleId {
    return this.activeStyle;
  }

  setVolume(linear: number): void {
    this.volume = Math.max(0, Math.min(1, linear));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private playLayer(
    note: number,
    durationSec: number,
    velocity: number,
    panMidi: number,
    layer: LayerKey,
    style: StyleId,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const preset = STYLE_PRESETS[style];
    const cfg = preset.layers[layer];
    const now = this.ctx.currentTime;

    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    const osc = this.ctx.createOscillator();

    osc.type = cfg.osc;
    osc.frequency.value = midiToFreq(note);
    osc.detune.value = cfg.detuneCents;

    const amp =
      Math.max(0.02, Math.min(0.32, ((velocity || 90) / 127) * 0.22 * cfg.velScale));
    const panNorm = ((panMidi || 64) - 64) / 64;
    panner.pan.value = Math.max(-1, Math.min(1, panNorm));

    const dur = Math.max(0.08, durationSec || 0.5);
    const atk = Math.max(0.002, cfg.attackSec);
    const relEnd = now + Math.max(0.12, dur * cfg.relMul);

    if (cfg.filterHz != null && cfg.filterHz > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cfg.filterHz;
      f.Q.value = 0.92;
      osc.connect(f);
      f.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(panner);
    panner.connect(this.masterGain);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(amp, now + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, relEnd);

    osc.start(now);
    osc.stop(relEnd + 0.04);
  }

  playEvent(ev: LiveNoteEvent): void {
    if (!this.ctx || !this.masterGain) return;
    const style = normalizeStyle(
      typeof ev.style === "string" ? ev.style : this.activeStyle,
    );

    const d = Math.max(0.12, Number(ev.duration ?? 0.5));
    const vel = Number(ev.velocity ?? 90);
    const pan = Number(ev.pan ?? 64);
    const base = Number(ev.base_note ?? 60);
    const lead = Number(ev.lead_note ?? base);
    const bassRaw = ev.bass_note != null ? Number(ev.bass_note) : base - 12;
    const bass = Number.isFinite(bassRaw) ? bassRaw : base - 12;

    const preset = STYLE_PRESETS[style];

    this.playLayer(base, d, vel, pan, "base", style);
    const leadVelMul = style === "pop" ? 22 : 18;
    this.playLayer(lead, d * 0.55, Math.max(34, vel - leadVelMul), pan, "lead", style);
    this.playLayer(bass, d * 1.05, Math.min(100, vel + 6), pan, "bass", style);

    const harmony = Array.isArray(ev.harmony) ? ev.harmony : [];
    harmony.forEach((h, i) => {
      window.setTimeout(() => {
        this.playLayer(Number(h), d * 0.75, Math.max(28, vel - 32), pan, "harmony", style);
      }, i * preset.harmonyStaggerMs);
    });
  }
}
