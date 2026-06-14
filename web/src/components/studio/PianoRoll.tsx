import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PianoRoll as PianoRollData } from "@/lib/api";

const LAYER_COLORS: Record<string, { fill: string; stroke: string }> = {
  melody: { fill: "rgba(167, 139, 250, 0.85)", stroke: "rgba(196, 181, 253, 1)" },
  lead: { fill: "rgba(34, 211, 238, 0.85)", stroke: "rgba(165, 243, 252, 1)" },
  bass: { fill: "rgba(244, 114, 182, 0.78)", stroke: "rgba(251, 207, 232, 1)" },
  harmony: { fill: "rgba(250, 204, 21, 0.72)", stroke: "rgba(254, 240, 138, 1)" },
};

const DEFAULT_LAYER = { fill: "rgba(148, 163, 184, 0.7)", stroke: "rgba(203, 213, 225, 1)" };

const LAYER_ORDER: PianoRollData["notes"][number]["layer"][] = ["bass", "harmony", "melody", "lead"];

export interface PianoRollProps {
  data: PianoRollData;
  /** Current playhead in seconds (0 to clip duration). Optional. */
  playheadSec?: number | null;
  /** Total clip duration in seconds. If absent, computed from `bpm`. */
  durationSec?: number | null;
  /** Beats per minute for the underlying clip. */
  bpm?: number;
  /** Visual height in px (canvas honors devicePixelRatio internally). */
  height?: number;
  className?: string;
  /** Per-layer mute toggle. Notes in muted layers are hidden. */
  hiddenLayers?: Set<string>;
}

/**
 * Canvas piano roll for sonified MIDI events.
 *
 * Renders 4 layers (melody / lead / bass / harmony) with note rectangles
 * colored by velocity. Auto-scales the time axis to fit; the pitch axis
 * pads ±2 semitones around the clip's actual range so notes never touch
 * the edges. Optional `playheadSec` draws a moving scrubber line.
 */
export function PianoRoll({
  data,
  playheadSec = null,
  durationSec = null,
  bpm = 96,
  height = 220,
  className,
  hiddenLayers,
}: PianoRollProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(640);

  const beatsPerSec = bpm / 60;
  const totalBeats = data.duration_beats || 1;
  const totalSec = durationSec ?? totalBeats / beatsPerSec;

  const pitchRange = useMemo(() => {
    const lo = Math.max(0, data.pitch_min - 2);
    const hi = Math.min(127, data.pitch_max + 2);
    return { lo, hi, span: Math.max(1, hi - lo) };
  }, [data.pitch_min, data.pitch_max]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv) return;
    const dpr = window.devicePixelRatio || 1;
    cnv.width = Math.floor(width * dpr);
    cnv.height = Math.floor(height * dpr);
    cnv.style.width = `${width}px`;
    cnv.style.height = `${height}px`;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padX = 32;
    const padY = 14;
    const innerW = Math.max(40, width - padX - 8);
    const innerH = Math.max(40, height - padY * 2);

    // Background grid: horizontal pitch lines for every C in the visible range.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let p = pitchRange.lo; p <= pitchRange.hi; p += 1) {
      if (p % 12 !== 0) continue;
      const y = padY + (1 - (p - pitchRange.lo) / pitchRange.span) * innerH;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + innerW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "10px monospace";
      const octave = Math.floor(p / 12) - 1;
      ctx.fillText(`C${octave}`, 4, y + 3);
    }

    // Vertical beat ticks every 4 beats.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    for (let b = 0; b <= totalBeats; b += 4) {
      const x = padX + (b / totalBeats) * innerW;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, padY + innerH);
      ctx.stroke();
    }

    const noteHpx = Math.max(2.5, innerH / pitchRange.span - 0.5);

    // Sort by layer order so leads sit visually on top.
    const ordered = [...data.notes].sort(
      (a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer),
    );

    for (const note of ordered) {
      if (hiddenLayers && hiddenLayers.has(note.layer)) continue;
      if (note.p < pitchRange.lo || note.p > pitchRange.hi) continue;
      const x = padX + (note.t / totalBeats) * innerW;
      const w = Math.max(1.5, (note.d / totalBeats) * innerW - 1);
      const y = padY + (1 - (note.p - pitchRange.lo) / pitchRange.span) * innerH - noteHpx / 2;
      const colors = LAYER_COLORS[note.layer] ?? DEFAULT_LAYER;
      // Velocity fades alpha 0.35 → 1.0
      const alpha = 0.35 + (Math.min(127, Math.max(0, note.v)) / 127) * 0.65;
      ctx.fillStyle = colors.fill.replace(/[\d.]+\)$/, `${alpha.toFixed(2)})`);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 0.75;
      const r = Math.min(2.5, noteHpx / 2);
      // Rounded rect (fallback for older Safari that lacks roundRect).
      if (typeof (ctx as any).roundRect === "function") {
        ctx.beginPath();
        (ctx as any).roundRect(x, y, w, noteHpx, r);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, w, noteHpx);
        ctx.strokeRect(x, y, w, noteHpx);
      }
    }

    // Playhead.
    if (playheadSec != null && totalSec > 0 && playheadSec >= 0 && playheadSec <= totalSec) {
      const phBeats = playheadSec * beatsPerSec;
      const x = padX + (phBeats / totalBeats) * innerW;
      ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, padY - 4);
      ctx.lineTo(x, padY + innerH + 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
      ctx.beginPath();
      ctx.arc(x, padY - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    beatsPerSec,
    data.notes,
    height,
    hiddenLayers,
    pitchRange.hi,
    pitchRange.lo,
    pitchRange.span,
    playheadSec,
    totalBeats,
    totalSec,
    width,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas ref={canvasRef} className="block w-full rounded-lg bg-black/40" />
    </div>
  );
}

export interface PianoRollPanelProps {
  data: PianoRollData;
  bpm?: number;
  /** Optional audio element. The panel binds a timeupdate handler for the playhead. */
  audio?: HTMLAudioElement | null;
  title?: string;
  className?: string;
}

const LAYER_LABELS: Record<string, string> = {
  melody: "Melody",
  lead: "Lead",
  bass: "Bass",
  harmony: "Harmony",
};

/** Self-contained panel with layer toggles + scrubber binding. */
export function PianoRollPanel({ data, bpm = 96, audio, title, className }: PianoRollPanelProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [playhead, setPlayhead] = useState<number | null>(null);

  useEffect(() => {
    if (!audio) {
      setPlayhead(null);
      return;
    }
    const tick = () => setPlayhead(audio.currentTime);
    const stop = () => setPlayhead(null);
    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", tick);
    audio.addEventListener("play", tick);
    return () => {
      audio.removeEventListener("timeupdate", tick);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", tick);
      audio.removeEventListener("play", tick);
    };
  }, [audio]);

  const toggleLayer = (layer: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const layerCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of data.notes) m[n.layer] = (m[n.layer] ?? 0) + 1;
    return m;
  }, [data.notes]);

  return (
    <div className={className ?? "space-y-2"}>
      {title ? (
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-white">{title}</p>
          <p className="text-[10px] text-white/40">
            {data.notes.length} notes · {data.duration_beats.toFixed(1)} beats
          </p>
        </div>
      ) : null}
      <PianoRoll data={data} bpm={bpm} playheadSec={playhead} hiddenLayers={hidden} />
      <div className="flex flex-wrap gap-1.5">
        {LAYER_ORDER.map((layer) => {
          const colors = LAYER_COLORS[layer] ?? DEFAULT_LAYER;
          const isHidden = hidden.has(layer);
          return (
            <button
              key={layer}
              type="button"
              onClick={() => toggleLayer(layer)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                isHidden ? "border-white/15 bg-white/[0.02] text-white/35" : "border-white/15 bg-white/[0.06] text-white/75 hover:bg-white/10"
              }`}
              aria-pressed={!isHidden}
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: colors.stroke, opacity: isHidden ? 0.35 : 1 }}
              />
              {LAYER_LABELS[layer] ?? layer}
              <span className="text-white/35">{layerCounts[layer] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
