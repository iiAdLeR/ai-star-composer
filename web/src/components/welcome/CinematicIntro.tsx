import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One-shot cinematic intro for the welcome page.
 *
 * Plays a ~5-second warp-jump sequence the first time the visitor lands
 * during a session, then fades into the actual welcome content. A `Skip
 * intro` button is always visible for returning users / impatient
 * playtesters, and `sessionStorage` makes sure we never replay it after
 * the user has already seen it once in the current tab session.
 *
 * The whole thing is canvas-only (no Three.js / no images) so it stays
 * cheap on low-end machines.
 */

const TOTAL_MS = 5200;
const STORAGE_KEY = "aisc.intro.shown.v1";
const STAR_COUNT = 720;
const MAX_STARS_REDUCED = 140;

type Star = {
  x: number;
  y: number;
  z: number;
  pz: number;
  hue: number;
};

interface CinematicIntroProps {
  /** When set, the intro will skip its session-cache check and always play. */
  force?: boolean;
  /** Fired right before the overlay unmounts. */
  onDone?: () => void;
}

function alreadySeen(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode etc. — playing again next visit is fine */
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CinematicIntro({ force = false, onDone }: CinematicIntroProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const finishingRef = useRef(false);

  // Defer mounting decision until after the first paint so SSR/hydration
  // never sees a flash of the overlay it would not have rendered.
  const [visible, setVisible] = useState<boolean>(() => {
    if (force) return true;
    if (typeof window === "undefined") return false;
    if (prefersReducedMotion()) return false;
    return !alreadySeen();
  });
  const [fadingOut, setFadingOut] = useState(false);

  const finish = (immediate = false) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    markSeen();
    setFadingOut(true);
    window.setTimeout(
      () => {
        setVisible(false);
        if (onDone) onDone();
      },
      immediate ? 0 : 650,
    );
  };

  useEffect(() => {
    if (!visible) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return undefined;

    // Adaptive density: small or low-end devices get the lighter starfield.
    const isSmall = window.matchMedia("(max-width: 640px)").matches;
    const isLowEnd = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency
      ? ((navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency as number) <= 4
      : false;
    const starCount = isSmall || isLowEnd ? MAX_STARS_REDUCED : STAR_COUNT;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const stars: Star[] = new Array(starCount).fill(0).map(() => spawnStar(width, height));
    startedAtRef.current = performance.now();

    const render = (now: number) => {
      const elapsed = now - startedAtRef.current;
      const t01 = Math.max(0, Math.min(1, elapsed / TOTAL_MS));

      // Three-phase warp:
      //  0.00 – 0.20  drift in   — slow, calm, hint of motion
      //  0.20 – 0.70  warp peak  — accelerate hard
      //  0.70 – 1.00  decel      — settle the camera, prep for handoff
      const speedCurve =
        t01 < 0.2
          ? 0.4 + (t01 / 0.2) * 0.8                       // 0.4 -> 1.2
          : t01 < 0.7
            ? 1.2 + Math.pow((t01 - 0.2) / 0.5, 1.6) * 8.0 // 1.2 -> 9.2
            : 9.2 - Math.pow((t01 - 0.7) / 0.3, 1.4) * 8.5; // 9.2 -> 0.7

      // Slowly drift hue across phases so the nebula glow shifts violet → cyan.
      const baseHue = 270 - t01 * 80;

      // Centre vignette + faint nebula behind the stars.
      const cx = width / 2;
      const cy = height / 2;
      // Hard-clear the frame so streaks don't double-expose with the
      // gradient (gradient itself is intentionally opaque to give the
      // nebula a deep, rich look as warp peaks).
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(width, height) * 0.85);
      const peakHeat = Math.pow(Math.max(0, Math.min(1, (t01 - 0.15) / 0.55)), 1.3);
      bg.addColorStop(0, `hsla(${baseHue}, 95%, ${28 + peakHeat * 22}%, 1)`);
      bg.addColorStop(0.45, `hsla(${baseHue - 30}, 65%, ${10 + peakHeat * 8}%, 1)`);
      bg.addColorStop(1, "#02010a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Star streaks (additive so brighter at peak)
      ctx.globalCompositeOperation = "lighter";
      const step = speedCurve;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= step;
        if (s.z <= 1) {
          // Respawn behind the camera once it has passed.
          const ns = spawnStar(width, height);
          s.x = ns.x;
          s.y = ns.y;
          s.z = ns.z;
          s.pz = s.z;
          s.hue = ns.hue;
        }
        const k = 128 / s.z;
        const px = cx + (s.x - cx) * k;
        const py = cy + (s.y - cy) * k;
        const pk = 128 / s.pz;
        const ppx = cx + (s.x - cx) * pk;
        const ppy = cy + (s.y - cy) * pk;

        // Off-screen culling — keeps the canvas thin even at 5k+ stars.
        if (px < -40 || px > width + 40 || py < -40 || py > height + 40) continue;

        const brightness = Math.min(1, 1.1 - s.z / 320);
        const trailAlpha = 0.18 + speedCurve * 0.085;
        ctx.strokeStyle = `hsla(${s.hue}, 90%, ${65 + brightness * 25}%, ${trailAlpha})`;
        ctx.lineWidth = Math.max(0.6, brightness * 1.6);
        ctx.beginPath();
        ctx.moveTo(ppx, ppy);
        ctx.lineTo(px, py);
        ctx.stroke();

        if (brightness > 0.7) {
          ctx.fillStyle = `hsla(${s.hue}, 100%, 95%, ${brightness})`;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.7, brightness * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // A bright central flash at peak warp.
      const flash = Math.max(0, 1 - Math.abs(t01 - 0.55) / 0.12);
      if (flash > 0) {
        ctx.globalCompositeOperation = "lighter";
        const r = Math.max(width, height) * 0.45;
        const rg = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
        rg.addColorStop(0, `hsla(${baseHue}, 95%, 80%, ${flash * 0.65})`);
        rg.addColorStop(0.4, `hsla(${baseHue - 30}, 95%, 60%, ${flash * 0.18})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (t01 >= 1) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("welcome.intro.aria")}
      className={`cinematic-intro fixed inset-0 z-[120] overflow-hidden ${
        fadingOut ? "cinematic-intro--out" : ""
      }`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      {/* Title reveal — uses pure CSS so the canvas can stay GPU-friendly. */}
      <div className="cinematic-intro-stage pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="cinematic-intro-ring" />
        <div className="cinematic-intro-mark relative mb-5 flex h-16 w-16 items-center justify-center md:h-20 md:w-20">
          <span className="cinematic-intro-mark-halo absolute inset-0 rounded-full" />
          <img
            src="/logo-mark.svg"
            alt=""
            className="relative h-full w-full drop-shadow-[0_0_24px_rgba(167,139,250,0.65)]"
            draggable={false}
          />
        </div>
        <p className="cinematic-intro-kicker text-[11px] font-medium uppercase tracking-[0.42em] text-violet-200/80">
          {t("welcome.intro.kicker")}
        </p>
        <h1 className="cinematic-intro-title mt-3 font-display text-[clamp(2.2rem,7vw,4rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white drop-shadow-[0_0_18px_rgba(124,58,237,0.45)]">
          {t("welcome.intro.title")}
        </h1>
        <p className="cinematic-intro-sub mt-3 max-w-md px-6 text-sm text-white/70 md:text-base">
          {t("welcome.intro.sub")}
        </p>
      </div>
      <button
        type="button"
        className="cinematic-intro-skip pointer-events-auto absolute right-4 top-4 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/80 backdrop-blur-md transition hover:border-white/55 hover:text-white md:right-6 md:top-6"
        onClick={() => finish()}
      >
        {t("welcome.intro.skip")}
      </button>
    </div>
  );
}

function spawnStar(width: number, height: number): Star {
  // Distribute new stars across the full canvas, biased slightly toward
  // the periphery so the centre stays dense without becoming a hot blob.
  const radius = Math.max(width, height);
  const r = Math.pow(Math.random(), 0.45) * radius * 0.65;
  const a = Math.random() * Math.PI * 2;
  // Hue palette: cool violets / cyans, with the occasional warm spark.
  const hue =
    Math.random() < 0.85
      ? 220 + Math.random() * 80              // 220..300 = blue → violet
      : 18 + Math.random() * 18;              // warm sparks
  return {
    x: width / 2 + Math.cos(a) * r,
    y: height / 2 + Math.sin(a) * r,
    z: 80 + Math.random() * 220,
    pz: 0,
    hue,
  };
}
