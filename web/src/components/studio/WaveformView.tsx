import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Canvas waveform visualizer.
 *
 * Fetches a WAV from `src`, decodes it once via Web Audio's
 * `decodeAudioData`, then renders peak bars on a HiDPI canvas. The decoded
 * peaks are cached per (src, bucketCount) so re-mounting the same audio
 * is essentially free.
 *
 * If an `audio` element is supplied, a playhead line is drawn at
 * `currentTime` and a click on the waveform seeks the element.
 */

const PEAKS_CACHE = new Map<string, { peaks: Float32Array; duration: number }>();
const DECODE_PROMISE = new Map<string, Promise<{ peaks: Float32Array; duration: number }>>();
const PEAK_BUCKETS = 480;

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (_audioCtx && _audioCtx.state !== "closed") return _audioCtx;
  // Safari still namespaces AudioContext on webkit.
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API is not available in this browser.");
  _audioCtx = new Ctor();
  return _audioCtx;
}

async function decodeToPeaks(src: string, buckets: number): Promise<{ peaks: Float32Array; duration: number }> {
  const cacheKey = `${src}::${buckets}`;
  const hit = PEAKS_CACHE.get(cacheKey);
  if (hit) return hit;
  const pending = DECODE_PROMISE.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const ctx = getAudioCtx();
    // decodeAudioData mutates the supplied ArrayBuffer in some browsers, so
    // copy first to keep the original buffer reusable.
    const audioBuf = await ctx.decodeAudioData(buf.slice(0));
    const length = audioBuf.length;
    const channels = audioBuf.numberOfChannels;
    // Min/Max pair per bucket so silent regions render as a flat line and
    // transients keep their punch. We collapse to a single absolute peak
    // (the louder of |min|/|max|) to keep the buffer compact.
    const peaks = new Float32Array(buckets);
    const samplesPerBucket = Math.max(1, Math.floor(length / buckets));
    for (let i = 0; i < buckets; i++) {
      const start = i * samplesPerBucket;
      const end = Math.min(length, start + samplesPerBucket);
      let peak = 0;
      for (let c = 0; c < channels; c++) {
        const data = audioBuf.getChannelData(c);
        for (let j = start; j < end; j++) {
          const v = Math.abs(data[j]);
          if (v > peak) peak = v;
        }
      }
      peaks[i] = peak;
    }
    const result = { peaks, duration: audioBuf.duration };
    PEAKS_CACHE.set(cacheKey, result);
    return result;
  })();
  DECODE_PROMISE.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    DECODE_PROMISE.delete(cacheKey);
  }
}

export interface WaveformViewProps {
  src: string;
  /** Optional audio element. The view binds a timeupdate handler for the playhead. */
  audio?: HTMLAudioElement | null;
  /** Visual height in px (canvas honors devicePixelRatio internally). */
  height?: number;
  /** Accent color (hex/rgba string). Falls back to cyan. */
  accent?: string;
  className?: string;
}

export function WaveformView({ src, audio, height = 96, accent, className }: WaveformViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);

  // Decode WAV when src changes.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPeaks(null);
    setDuration(null);
    if (!src) return undefined;
    setLoading(true);
    decodeToPeaks(src, PEAK_BUCKETS)
      .then((result) => {
        if (cancelled) return;
        setPeaks(result.peaks);
        setDuration(result.duration);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Playhead binding to an external audio element.
  useEffect(() => {
    if (!audio) {
      setPlayhead(null);
      return undefined;
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const widthCss = Math.max(120, wrap.clientWidth);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(widthCss * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${widthCss}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgba(0, 0, 0, 0.40)";
    ctx.fillRect(0, 0, widthCss, height);

    // Centerline.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(widthCss, height / 2);
    ctx.stroke();

    if (!peaks || peaks.length === 0) return;

    const accentColor = accent ?? "rgba(34, 211, 238, 0.85)";
    const pastAccent = accent ?? "rgba(167, 139, 250, 0.65)";

    // Use the played fraction to switch colors mid-canvas.
    const playedFrac =
      playhead != null && duration && duration > 0 ? Math.min(1, Math.max(0, playhead / duration)) : 0;

    const buckets = peaks.length;
    const bucketWidth = widthCss / buckets;
    const barWidth = Math.max(1, bucketWidth * 0.78);

    for (let i = 0; i < buckets; i++) {
      const v = peaks[i];
      const h = Math.max(1, v * (height - 4));
      const x = i * bucketWidth + (bucketWidth - barWidth) / 2;
      const y = (height - h) / 2;
      const frac = (i + 0.5) / buckets;
      ctx.fillStyle = frac <= playedFrac ? pastAccent : accentColor;
      ctx.fillRect(x, y, barWidth, h);
    }

    // Playhead line.
    if (playedFrac > 0 && playedFrac < 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const px = playedFrac * widthCss;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
  }, [accent, duration, height, peaks, playhead]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!audio || !duration) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frac = Math.max(0, Math.min(1, x / rect.width));
      try {
        audio.currentTime = frac * duration;
      } catch {
        // Some browsers throw on seek before metadata is loaded.
      }
    },
    [audio, duration],
  );

  const totalMmss = useMemo(() => {
    if (!duration) return null;
    const m = Math.floor(duration / 60);
    const s = Math.floor(duration % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }, [duration]);

  const playMmss = useMemo(() => {
    if (playhead == null) return null;
    const m = Math.floor(playhead / 60);
    const s = Math.floor(playhead % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }, [playhead]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className={`block w-full rounded-lg ${audio ? "cursor-pointer" : ""}`}
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
        <span>
          {loading
            ? "decoding…"
            : error
              ? <span className="text-rose-300">err: {error}</span>
              : playMmss && totalMmss
                ? `${playMmss} / ${totalMmss}`
                : totalMmss ?? ""}
        </span>
        <span>{audio ? "click to seek" : ""}</span>
      </div>
    </div>
  );
}
