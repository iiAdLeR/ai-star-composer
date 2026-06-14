/**
 * Tiny UI sound system.
 *
 * Six short cues synthesized on the fly via the Web Audio API - no asset
 * downloads, no Howler/Tone dependency. Each cue is < 250ms so they layer
 * cleanly with text-to-speech and audio playback elsewhere in the app.
 *
 * Preference rules:
 *   - Default ON for first-time users.
 *   - Default OFF when `prefers-reduced-motion: reduce` is set
 *     (motion sensitivity often correlates with sound sensitivity).
 *   - The user toggle persists to localStorage and supersedes both defaults.
 *
 * Browsers require a user gesture before audio is allowed; the very first
 * cue resumes a suspended AudioContext on demand, then subsequent cues play
 * silently if `enabled === false`.
 */

const STORAGE_KEY = "ai-star-composer.sound-on";

export type UiCue =
  | "boot"
  | "hover"
  | "success"
  | "error"
  | "info"
  | "warning"
  | "achievement";

interface CueSpec {
  /** Sequence of (midi note, duration ms, velocity 0..1) tuples. */
  notes: ReadonlyArray<[number, number, number]>;
  osc: OscillatorType;
  /** Stagger between consecutive notes in ms (0 = chord). */
  stagger: number;
}

const CUES: Record<UiCue, CueSpec> = {
  // A4 - same note as the boot splash, single warm tone.
  boot: { notes: [[69, 700, 0.18]], osc: "sine", stagger: 0 },
  // E5 - feather-light hover ping.
  hover: { notes: [[76, 90, 0.06]], osc: "sine", stagger: 0 },
  // C major triad arpeggio (rising).
  success: { notes: [[72, 90, 0.18], [76, 90, 0.18], [79, 140, 0.20]], osc: "sine", stagger: 80 },
  // Minor third descent - clearly "something went wrong" without alarm.
  error: { notes: [[67, 140, 0.20], [63, 220, 0.22]], osc: "triangle", stagger: 110 },
  // Single neutral G4.
  info: { notes: [[67, 110, 0.14]], osc: "sine", stagger: 0 },
  // Sustained A4 - a beat shy of urgent.
  warning: { notes: [[69, 240, 0.16]], osc: "triangle", stagger: 0 },
  // Octave arpeggio C5–E5–G5–C6 (the unlock chime).
  achievement: { notes: [[72, 110, 0.20], [76, 110, 0.22], [79, 110, 0.22], [84, 220, 0.26]], osc: "triangle", stagger: 90 },
};

let _ctx: AudioContext | null = null;
let _enabled: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx && _ctx.state !== "closed") return _ctx;
  type WinWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || (window as WinWithWebkit).webkitAudioContext;
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
  } catch {
    _ctx = null;
  }
  return _ctx;
}

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isSoundEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "0") {
      _enabled = false;
    } else if (raw === "1") {
      _enabled = true;
    } else {
      _enabled = !reducedMotion();
    }
  } catch {
    _enabled = !reducedMotion();
  }
  return _enabled;
}

export function setSoundEnabled(on: boolean): void {
  _enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  for (const cb of listeners) cb(on);
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

export function subscribeSound(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function midiToFreq(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

function playOne(audio: AudioContext, freq: number, durMs: number, vel: number, osc: OscillatorType): void {
  const t0 = audio.currentTime + 0.005;
  const dur = durMs / 1000;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = osc;
  o.frequency.setValueAtTime(freq, t0);
  // Quick attack (12ms), exponential decay so cues never click off.
  const attack = 0.012;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vel, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audio.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.04);
}

export function playCue(cue: UiCue): void {
  if (!isSoundEnabled()) return;
  const audio = ctx();
  if (!audio) return;
  // Browsers gate AudioContext until first user gesture; resume() is a no-op
  // if already running.
  if (audio.state === "suspended") {
    void audio.resume();
  }
  const spec = CUES[cue];
  spec.notes.forEach(([note, dur, vel], i) => {
    const delay = i * spec.stagger;
    window.setTimeout(() => playOne(audio, midiToFreq(note), dur, vel, spec.osc), delay);
  });
}
