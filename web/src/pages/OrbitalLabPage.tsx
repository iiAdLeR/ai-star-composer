import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { OrbitSvg } from "@/components/lab/OrbitSvg";
import { ExplainPanel } from "@/components/studio/ExplainPanel";
import { PianoRollPanel } from "@/components/studio/PianoRoll";
import { WaveformView } from "@/components/studio/WaveformView";
import { useToast } from "@/components/ui/Toast";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { getApiBase } from "@/lib/apiBase";
import {
  type GenerateResponse,
  type OrbitPreview,
  fetchOrbitPreview,
  runOrbitalLab,
} from "@/lib/api";
import { artifactUrl } from "@/lib/artifacts";

/**
 * Orbital Lab - the "physics playground" page.
 *
 * Two sliders (a, e) drive a live SVG preview + computed period / extrema.
 * Hitting "Sonify" sends the synthetic orbit through the same harmony engine
 * used for real planets, so the lab feels seamless with the rest of the app.
 *
 * URL params `?name=`, `?a=`, `?e=` make any configuration shareable.
 */

const SAFE_NAME_RE = /^[\w \-'(),.]{1,40}$/;
const STYLES = ["calm", "pop", "study", "cinematic", "drone"] as const;

export function OrbitalLabPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const track = useAchievementTracker();
  const apiBase = getApiBase();
  const [params, setParams] = useSearchParams();

  const initialName = params.get("name") || "Custom Object";
  const initialA = Number(params.get("a") ?? 1.0);
  const initialE = Number(params.get("e") ?? 0.05);

  const [name, setName] = useState(SAFE_NAME_RE.test(initialName) ? initialName : "Custom Object");
  const [a, setA] = useState(Number.isFinite(initialA) ? Math.min(80, Math.max(0.05, initialA)) : 1.0);
  const [e, setE] = useState(Number.isFinite(initialE) ? Math.min(0.99, Math.max(0, initialE)) : 0.05);
  const [days, setDays] = useState(30);
  const [seed, setSeed] = useState(42);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("calm");
  const [mode, setMode] = useState<"baseline" | "ai">("baseline");

  const [preview, setPreview] = useState<OrbitPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  // Keep URL in sync (replace, not push, so it doesn't pollute browser history).
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("name", name);
        next.set("a", a.toString());
        next.set("e", e.toString());
        return next;
      },
      { replace: true },
    );
  }, [a, e, name, setParams]);

  // Preview is now computed locally (Kepler math in JS), so update instantly
  // on every slider move - no debounce, no network round-trip.
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    fetchOrbitPreview(a, e, 240)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [a, e]);

  const onSonify = useCallback(async () => {
    if (running) return;
    if (!SAFE_NAME_RE.test(name)) {
      toast.push(t("lab.toastBadName"), { variant: "error" });
      return;
    }
    setRunning(true);
    try {
      const r = await runOrbitalLab({
        semi_major_axis_au: a,
        eccentricity: e,
        days,
        seed,
        style_id: style,
        mode,
        object_name: name,
      });
      setResult(r);
      track("lab:sonify");
      toast.push(t("lab.toastDone", { name, count: r.count }), { variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.push(t("lab.toastFail", { message: msg }), { variant: "error", duration: 6000 });
    } finally {
      setRunning(false);
    }
  }, [a, days, e, mode, name, running, seed, style, t, toast, track]);

  const periodLabel = useMemo(() => {
    if (!preview) return " - ";
    const d = preview.period_days;
    if (d < 365) return `${d.toFixed(1)} d`;
    return `${(d / 365.25).toFixed(2)} yr`;
  }, [preview]);

  // Presets - quick-load famous orbits for fast classroom demos.
  const presets: { id: string; label: string; a: number; e: number }[] = [
    { id: "earth", label: t("lab.preset.earth"), a: 1.0, e: 0.017 },
    { id: "mars", label: t("lab.preset.mars"), a: 1.524, e: 0.0934 },
    { id: "halley", label: t("lab.preset.halley"), a: 17.8, e: 0.967 },
    { id: "neptune", label: t("lab.preset.neptune"), a: 30.07, e: 0.011 },
    { id: "circle", label: t("lab.preset.circle"), a: 1.0, e: 0.0 },
    { id: "stretched", label: t("lab.preset.stretched"), a: 5.0, e: 0.85 },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("lab.kicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("lab.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("lab.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Controls */}
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:p-6">
          <div>
            <label htmlFor="lab-name" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45">
              {t("lab.name")}
            </label>
            <input
              id="lab-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              maxLength={40}
              placeholder={t("lab.namePlaceholder")}
              className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            />
            <p className="mt-1 text-[10px] text-white/35">{t("lab.nameHint")}</p>
          </div>

          {/* Presets row */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">{t("lab.presets")}</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setA(p.a);
                    setE(p.e);
                  }}
                  className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* a slider */}
          <SliderRow
            label={t("lab.semiMajor")}
            hint={t("lab.semiMajorHint")}
            value={a}
            min={0.1}
            max={30}
            step={0.01}
            displayValue={`${a.toFixed(2)} AU`}
            onChange={setA}
            logScale
          />

          {/* e slider */}
          <SliderRow
            label={t("lab.eccentricity")}
            hint={t("lab.eccentricityHint")}
            value={e}
            min={0}
            max={0.99}
            step={0.001}
            displayValue={e.toFixed(3)}
            onChange={setE}
          />

          {/* Sonification params */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="lab-days" className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45">
                {t("lab.days")}
              </label>
              <input
                id="lab-days"
                type="number"
                min={1}
                max={1200}
                value={days}
                onChange={(ev) => setDays(Number(ev.target.value))}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
              />
            </div>
            <div>
              <label htmlFor="lab-seed" className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45">
                {t("lab.seed")}
              </label>
              <input
                id="lab-seed"
                type="number"
                min={0}
                value={seed}
                onChange={(ev) => setSeed(Number(ev.target.value))}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
              />
            </div>
            <div>
              <label htmlFor="lab-style" className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45">
                {t("lab.style")}
              </label>
              <select
                id="lab-style"
                value={style}
                onChange={(ev) => setStyle(ev.target.value as (typeof STYLES)[number])}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setMode("baseline")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  mode === "baseline"
                    ? "bg-gradient-to-r from-violet-600/45 to-cyan-600/35 text-white ring-1 ring-white/15"
                    : "text-white/55 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {t("lab.modeBaseline")}
              </button>
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  mode === "ai"
                    ? "bg-gradient-to-r from-violet-600/45 to-cyan-600/35 text-white ring-1 ring-white/15"
                    : "text-white/55 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {t("lab.modeAi")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void onSonify()}
              disabled={running}
              className="font-display flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? t("lab.running") : `♪ ${t("lab.sonify")}`}
            </button>
          </div>
        </section>

        {/* Preview */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold tracking-tight text-white">{t("lab.previewTitle")}</h2>
            {previewLoading ? <span className="text-[10px] text-white/40">…</span> : null}
          </div>
          {previewError ? (
            <p className="text-xs text-rose-300">{previewError}</p>
          ) : null}
          <OrbitSvg preview={preview} height={280} className="rounded-xl border border-white/10 bg-black/40 p-2" />

          {preview ? (
            <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <Stat label={t("lab.stat.period")} value={periodLabel} />
              <Stat label={t("lab.stat.perihelion")} value={`${preview.perihelion_au.toFixed(3)} AU`} />
              <Stat label={t("lab.stat.aphelion")} value={`${preview.aphelion_au.toFixed(3)} AU`} />
              <Stat
                label={t("lab.stat.speed")}
                value={`${preview.min_speed_km_s.toFixed(1)}–${preview.max_speed_km_s.toFixed(1)} km/s`}
              />
            </dl>
          ) : null}

          <p className="text-[10px] leading-relaxed text-white/40">{t("lab.previewHint")}</p>
        </section>
      </div>

      {/* Results */}
      {result ? (
        <section className="mt-8 space-y-4 rounded-2xl border border-cyan-400/25 bg-white/[0.03] p-5 backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              {result.planet} · {result.style} · {result.mode}
            </h2>
            <span className="text-[11px] text-white/45">{result.count} samples · {result.bpm} BPM</span>
          </div>
          <audio
            ref={(el) => setAudioEl(el)}
            controls
            preload="auto"
            className="h-10 w-full"
            src={artifactUrl(apiBase, result.melody_wav) ?? undefined}
          />
          {artifactUrl(apiBase, result.melody_wav) ? (
            <WaveformView
              src={artifactUrl(apiBase, result.melody_wav) as string}
              audio={audioEl}
              accent="rgba(34, 211, 238, 0.85)"
              height={64}
            />
          ) : null}
          {result.piano_roll ? (
            <PianoRollPanel data={result.piano_roll} bpm={result.bpm ?? 96} audio={audioEl} />
          ) : null}
          {result.explanation ? <ExplainPanel explanation={result.explanation} /> : null}
        </section>
      ) : null}
    </>
  );
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  logScale = false,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
  logScale?: boolean;
}) {
  // For wide ranges (e.g. 0.1..30 AU), a log scale makes the slider feel
  // natural - most planets cluster < 5 AU.
  const sliderValue = logScale ? Math.log(value) : value;
  const sliderMin = logScale ? Math.log(min) : min;
  const sliderMax = logScale ? Math.log(max) : max;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</label>
        <span className="font-mono text-[11px] text-cyan-200">{displayValue}</span>
      </div>
      <input
        type="range"
        value={sliderValue}
        min={sliderMin}
        max={sliderMax}
        step={logScale ? (Math.log(max) - Math.log(min)) / 400 : step}
        onChange={(ev) => {
          const raw = Number(ev.target.value);
          onChange(logScale ? Math.exp(raw) : raw);
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400"
      />
      {hint ? <p className="mt-1 text-[10px] text-white/35">{hint}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-white/85">{value}</p>
    </div>
  );
}
