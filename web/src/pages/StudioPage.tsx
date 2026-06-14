import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { ExplainPanel } from "@/components/studio/ExplainPanel";
import { PianoRollPanel } from "@/components/studio/PianoRoll";
import { WaveformView } from "@/components/studio/WaveformView";
import { useToast } from "@/components/ui/Toast";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { useStudioPlanet } from "@/context/StudioPlanetContext";
import { getPlanetTheme, planetCssVars } from "@/lib/planetTheme";
import {
  type CompareResponse,
  type GeneratePayload,
  type GenerateResponse,
  type RenderCapabilities,
  type StyleId,
  type StyleInfo,
  type SonifyMode,
  type HealthResponse,
  exportBundleUrl,
  fetchHealth,
  fetchRenderCapabilities,
  fetchStyles,
  postCompare,
  postGenerate,
} from "@/lib/api";
import { fetchBackgrounds } from "@/lib/api";
import { getApiBase } from "@/lib/apiBase";
import { artifactUrl } from "@/lib/artifacts";
import { parseDaysParam, parseModeParam, parseSeedParam, parseStyleParam } from "@/lib/studioQuery";

const STUDIO_HISTORY_KEY = "ai-star-studio-history-v1";

type SessionEntry = {
  id: string;
  createdAt: number;
  kind: "generate" | "compare";
  planet: string;
  days: number;
  mode: SonifyMode;
  style: StyleId;
  seed: number;
};

async function withRetry<T>(
  run: () => Promise<T>,
  retries = 2,
  delayMs = 260,
): Promise<{ value: T; attempts: number }> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const value = await run();
      return { value, attempts: i + 1 };
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await new Promise((r) => window.setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function MetricsTable({ metrics }: { metrics: Record<string, number> }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return null;
  // auto-fill + minmax means the grid is driven by the *container* width, not
  // the viewport — important because this table lives inside a narrow Studio
  // sidebar (~460px on desktop), where `sm:grid-cols-2` would otherwise force
  // two columns that are too cramped for the long metric names.
  //
  // Each cell stacks label-above-value: the label (`repetition_rate`,
  // `pitch_range_semitones`, …) wraps cleanly when long, and the numeric value
  // gets `tabular-nums` so digits don't shift width across rows.
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-2 text-sm">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
        >
          <dt className="break-all font-mono text-[10px] uppercase tracking-wider text-white/45">{k}</dt>
          <dd className="mt-0.5 font-mono text-sm tabular-nums text-cyan-200/90">
            {Number.isFinite(v) ? v.toFixed(4) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AudioIfWav({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-white/50">{label}</p>
      <audio className="h-9 w-full max-w-md" controls src={url} preload="none" />
    </div>
  );
}

function ArtifactLinks({
  apiBase,
  title,
  midi,
  melody,
  hq,
  hybrid,
  t,
}: {
  apiBase: string;
  title: string;
  midi: string;
  melody: string;
  hq: string | null;
  hybrid: string | null;
  t: (k: string, opts?: Record<string, string>) => string;
}) {
  const midiU = artifactUrl(apiBase, midi);
  const melU = artifactUrl(apiBase, melody);
  const hqU = artifactUrl(apiBase, hq);
  const hyU = artifactUrl(apiBase, hybrid);
  const bundleU = exportBundleUrl(apiBase, midi);

  const linkCls =
    "inline-flex items-center gap-1 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100";
  const bundleCls =
    "inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-500/20";

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="font-display text-sm font-semibold text-white">{title}</p>
      <div className="flex flex-wrap gap-2">
        {midiU ? (
          <a className={linkCls} href={midiU} target="_blank" rel="noreferrer">
            {t("studio.artifacts.midi")}
          </a>
        ) : null}
        {melU ? (
          <a className={linkCls} href={melU} target="_blank" rel="noreferrer">
            {t("studio.artifacts.melody")}
          </a>
        ) : null}
        {hqU ? (
          <a className={linkCls} href={hqU} target="_blank" rel="noreferrer">
            {t("studio.artifacts.hq")}
          </a>
        ) : null}
        {hyU ? (
          <a className={linkCls} href={hyU} target="_blank" rel="noreferrer">
            {t("studio.artifacts.hybrid")}
          </a>
        ) : null}
        {bundleU ? (
          <a className={bundleCls} href={bundleU} target="_blank" rel="noreferrer" download>
            {t("studio.artifacts.bundle")}
          </a>
        ) : null}
      </div>
      <div className="space-y-3 border-t border-white/5 pt-3">
        <AudioIfWav label={t("studio.artifacts.melody")} url={melU} />
        <AudioIfWav label={t("studio.artifacts.hq")} url={hqU} />
        <AudioIfWav label={t("studio.artifacts.hybrid")} url={hyU} />
      </div>
    </div>
  );
}

export function StudioPage() {
  const { t, i18n } = useTranslation();
  const { planet } = useStudioPlanet();
  const apiBase = useMemo(() => getApiBase(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const track = useAchievementTracker();

  const [caps, setCaps] = useState<RenderCapabilities | null>(null);
  const [capsErr, setCapsErr] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stylesList, setStylesList] = useState<StyleInfo[] | null>(null);
  const [days, setDays] = useState<number>(30);
  const [mode, setMode] = useState<SonifyMode>("ai");
  const [style, setStyle] = useState<StyleId>("calm");
  const [seed, setSeed] = useState<number>(42);
  const [advanced, setAdvanced] = useState(false);
  const [fgGain, setFgGain] = useState(0.85);
  const [bgGain, setBgGain] = useState(0.35);
  const [fadeMs, setFadeMs] = useState(80);
  const [ducking, setDucking] = useState(true);
  const [duckStr, setDuckStr] = useState(0.45);
  // Whitelisted server-side filename only; the API no longer accepts arbitrary paths.
  const [nasaBgName, setNasaBgName] = useState("");
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [useLstm, setUseLstm] = useState(false);
  const [lstmDevice, setLstmDevice] = useState<"cpu" | "cuda">("cpu");
  // Sampling temperature for the LSTM head (0.1 = strict, 1.8 = wild).
  const [lstmTemp, setLstmTemp] = useState(0.92);

  const [genLoading, setGenLoading] = useState(false);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [cmpError, setCmpError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<GenerateResponse | null>(null);
  const [cmpResult, setCmpResult] = useState<CompareResponse | null>(null);
  // Audio elements that drive the piano-roll playhead. Stored in state (not
  // refs) so the PianoRollPanel re-subscribes its listeners when the element
  // mounts/unmounts.
  const [genAudio, setGenAudio] = useState<HTMLAudioElement | null>(null);
  const [cmpBaseAudio, setCmpBaseAudio] = useState<HTMLAudioElement | null>(null);
  const [cmpAiAudio, setCmpAiAudio] = useState<HTMLAudioElement | null>(null);
  const [diagAttempts, setDiagAttempts] = useState(0);
  const [diagMs, setDiagMs] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [history, setHistory] = useState<SessionEntry[]>([]);

  const loadCaps = useCallback(async () => {
    const start = performance.now();
    setCapsErr(null);
    try {
      const [capsRes, healthRes] = await Promise.all([
        withRetry(fetchRenderCapabilities, 2, 300),
        withRetry(fetchHealth, 2, 300),
      ]);
      setCaps(capsRes.value);
      setHealth(healthRes.value);
      setDiagAttempts(Math.max(capsRes.attempts, healthRes.attempts));
    } catch (e) {
      setCapsErr(e instanceof Error ? e.message : String(e));
      setDiagAttempts(3);
    } finally {
      setDiagMs(Math.round(performance.now() - start));
    }
  }, []);

  useLayoutEffect(() => {
    const d = searchParams.get("days");
    if (d != null && d !== "") setDays(parseDaysParam(d, 30));
    const sd = searchParams.get("seed");
    if (sd != null && sd !== "") setSeed(parseSeedParam(sd, 42));
    const m = searchParams.get("mode");
    if (m != null && m !== "") setMode(parseModeParam(m, "ai"));
    const st = searchParams.get("style");
    if (st != null && st !== "") setStyle(parseStyleParam(st, "calm"));
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        let changed = false;
        const setIf = (k: string, v: string) => {
          if (next.get(k) !== v) {
            next.set(k, v);
            changed = true;
          }
        };
        setIf("days", String(days));
        setIf("mode", mode);
        setIf("style", style);
        setIf("seed", String(seed));
        return changed ? next : prev;
      },
      { replace: true },
    );
  }, [days, mode, style, seed, setSearchParams]);

  useEffect(() => {
    void loadCaps();
    void fetchStyles()
      .then((r) => setStylesList(r.styles))
      .catch(() => setStylesList(null));
    void fetchBackgrounds()
      .then((r) => setBackgrounds(r.backgrounds ?? []))
      .catch(() => setBackgrounds([]));
  }, [loadCaps]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDIO_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SessionEntry[];
      if (!Array.isArray(parsed)) return;
      setHistory(parsed.slice(0, 8));
    } catch {
      /* ignore malformed local storage */
    }
  }, []);

  const payload = useMemo((): GeneratePayload => {
    const p: GeneratePayload = {
      planet,
      days,
      mode,
      style,
      seed,
      fg_gain: fgGain,
      bg_gain: bgGain,
      fade_ms: fadeMs,
      ducking,
      ducking_strength: duckStr,
    };
    const bg = nasaBgName.trim();
    if (bg) p.nasa_background_name = bg;
    if (useLstm && mode === "ai") {
      p.use_lstm = true;
      p.lstm_device = lstmDevice;
      p.lstm_temperature = lstmTemp;
    }
    return p;
  }, [
    planet,
    days,
    mode,
    style,
    seed,
    fgGain,
    bgGain,
    fadeMs,
    ducking,
    duckStr,
    nasaBgName,
    useLstm,
    lstmDevice,
    lstmTemp,
  ]);

  // Per-planet color tokens drive every accent (planet badge, AI compare panel,
  // result spotlight border) so the UI feels like it belongs to the world the
  // user picked in the 3D scene.
  const planetTheme = useMemo(() => getPlanetTheme(planet), [planet]);
  const planetVars = useMemo(() => planetCssVars(planetTheme), [planetTheme]);

  const styleLabel = useCallback(
    (s: StyleInfo) => {
      if (i18n.language.startsWith("tr")) {
        const key = `studio.styles.${s.id}`;
        const tr = t(key);
        if (tr !== key) return tr;
      }
      return s.label_en;
    },
    [i18n.language, t],
  );

  const onGenerate = async () => {
    setGenLoading(true);
    setGenError(null);
    setGenResult(null);
    try {
      const res = await postGenerate(payload);
      setGenResult(res);
      track("studio:generate", { planet: res.planet });
      if (res.mode === "ai") track("studio:ai-mode");
      toast.push(
        t("studio.toasts.generateOk", { planet: res.planet, count: res.count }),
        { variant: "success" },
      );
      setHistory((prev) => {
        const next: SessionEntry[] = [
          {
            id: `${Date.now()}-gen`,
            createdAt: Date.now(),
            kind: "generate" as const,
            planet: payload.planet,
            days: payload.days,
            mode: payload.mode,
            style: payload.style,
            seed: payload.seed,
          },
          ...prev,
        ].slice(0, 8);
        localStorage.setItem(STUDIO_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenError(msg);
      toast.push(t("studio.toasts.generateFail", { message: msg }), { variant: "error", duration: 6000 });
    } finally {
      setGenLoading(false);
    }
  };

  const onCompare = async () => {
    setCmpLoading(true);
    setCmpError(null);
    setCmpResult(null);
    try {
      const res = await postCompare(payload);
      setCmpResult(res);
      track("studio:compare", { planet: res.planet });
      toast.push(
        t("studio.toasts.compareOk", { planet: res.planet }),
        { variant: "success" },
      );
      setHistory((prev) => {
        const next: SessionEntry[] = [
          {
            id: `${Date.now()}-cmp`,
            createdAt: Date.now(),
            kind: "compare" as const,
            planet: payload.planet,
            days: payload.days,
            mode: payload.mode,
            style: payload.style,
            seed: payload.seed,
          },
          ...prev,
        ].slice(0, 8);
        localStorage.setItem(STUDIO_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCmpError(msg);
      toast.push(t("studio.toasts.compareFail", { message: msg }), { variant: "error", duration: 6000 });
    } finally {
      setCmpLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30";
  const labelCls = "mb-1 block text-xs font-medium text-white/55";
  const applyHistory = (h: SessionEntry) => {
    setDays(h.days);
    setMode(h.mode);
    setStyle(h.style);
    setSeed(h.seed);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("planet", h.planet);
        next.set("days", String(h.days));
        next.set("mode", h.mode);
        next.set("style", h.style);
        next.set("seed", String(h.seed));
        return next;
      },
      { replace: false },
    );
  };
  const copyShareLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      toast.push(t("studio.toasts.shareCopied"), { variant: "info", duration: 2000 });
      window.setTimeout(() => setShareCopied(false), 1400);
    } catch {
      setShareCopied(false);
      toast.push(t("studio.toasts.shareFailed"), { variant: "warning" });
    }
  };
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STUDIO_HISTORY_KEY);
  };

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">{t("studio.title")}</h1>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
          >
            {shareCopied ? t("studio.shareCopied") : t("studio.shareLink")}
          </button>
        </div>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-white/50">{t("studio.subtitle")}</p>
      </div>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md sm:mb-8 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-white/80">{t("studio.capabilities.title")}</p>
            <button
              type="button"
              onClick={() => void loadCaps()}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/5"
            >
              {t("studio.capabilities.refresh")}
            </button>
          </div>
          {capsErr ? (
            <p className="mt-2 text-sm text-rose-300/90">{capsErr}</p>
          ) : caps ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={
                  caps.fluidsynth_found
                    ? "rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30"
                    : "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-400/25"
                }
              >
                {caps.fluidsynth_found
                  ? t("studio.capabilities.fsOk")
                  : t("studio.capabilities.fsMissing")}
              </span>
              <span
                className={
                  caps.soundfont_configured
                    ? "rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-medium text-cyan-200 ring-1 ring-cyan-400/30"
                    : "rounded-full bg-white/10 px-3 py-1 text-xs text-white/55 ring-1 ring-white/10"
                }
              >
                {caps.soundfont_configured
                  ? t("studio.capabilities.sfOk")
                  : t("studio.capabilities.sfMissing")}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/45">{t("studio.capabilities.loading")}</p>
          )}
          {health && !capsErr ? (
            <>
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-white/38">
                {t("studio.capabilities.healthLineShort", {
                  version: health.api_version ?? "—",
                  fs: health.fluidsynth_on_path ? t("studio.capabilities.pathYes") : t("studio.capabilities.pathNo"),
                })}
              </p>
              {health.lstm_checkpoint_ready !== undefined ? (
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-white/38">
                  {t("studio.capabilities.lstmLine", {
                    ready: health.lstm_checkpoint_ready
                      ? t("studio.capabilities.pathYes")
                      : t("studio.capabilities.pathNo"),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
          {diagMs != null ? (
            <p className="mt-2 text-[11px] text-white/35">
              {t("studio.capabilities.diagLine", { ms: String(diagMs), attempts: String(diagAttempts) })}
            </p>
          ) : null}
      </section>

      <div className="flex flex-col gap-6 sm:gap-8">
        <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md sm:p-6">
            <h2 className="font-display text-lg font-semibold text-white">{t("studio.form.title")}</h2>

            <p
              style={{
                ...planetVars,
                borderColor: "color-mix(in srgb, var(--planet-accent) 35%, transparent)",
                background: "var(--planet-accent-soft)",
                boxShadow: "inset 0 0 32px color-mix(in srgb, var(--planet-glow) 30%, transparent)",
              }}
              className="mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
            >
              <span className="text-white/50">{t("studio.form.planet")}: </span>
              <span className="font-semibold" style={{ color: planetTheme.text }}>
                {planet}
              </span>
              <span className="text-white/40"> — </span>
              <span className="text-white/55">{t("studio.form.planetHint")}</span>
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className={labelCls} htmlFor="days">
                  {t("studio.form.days")}
                </label>
                <input
                  id="days"
                  type="number"
                  min={7}
                  max={365}
                  className={inputCls}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="mode">
                  {t("studio.form.mode")}
                </label>
                <select id="mode" className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as SonifyMode)}>
                  <option value="ai" className="bg-zinc-900">
                    {t("studio.form.modeAi")}
                  </option>
                  <option value="baseline" className="bg-zinc-900">
                    {t("studio.form.modeBaseline")}
                  </option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="style">
                  {t("studio.form.style")}
                </label>
                <select id="style" className={inputCls} value={style} onChange={(e) => setStyle(e.target.value as StyleId)}>
                  {(stylesList ?? [
                    { id: "calm", label_en: "Calm", label_ar: "" },
                    { id: "pop", label_en: "Pop", label_ar: "" },
                    { id: "study", label_en: "Study", label_ar: "" },
                    { id: "cinematic", label_en: "Cinematic", label_ar: "" },
                    { id: "drone", label_en: "Planet drone", label_ar: "" },
                  ]).map((s) => (
                    <option key={s.id} value={s.id} className="bg-zinc-900">
                      {styleLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="seed">
                  {t("studio.form.seed")}
                </label>
                <input
                  id="seed"
                  type="number"
                  className={inputCls}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
              </div>

              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="text-xs font-medium text-cyan-400/90 underline-offset-2 hover:underline"
              >
                {advanced ? t("studio.form.advancedHide") : t("studio.form.advancedShow")}
              </button>

              {advanced ? (
                <div className="space-y-3 border-t border-white/10 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("studio.form.fgGain")}</label>
                      <input
                        type="number"
                        step={0.05}
                        min={0.1}
                        max={1.5}
                        className={inputCls}
                        value={fgGain}
                        onChange={(e) => setFgGain(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t("studio.form.bgGain")}</label>
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1.5}
                        className={inputCls}
                        value={bgGain}
                        onChange={(e) => setBgGain(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>{t("studio.form.fadeMs")}</label>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      className={inputCls}
                      value={fadeMs}
                      onChange={(e) => setFadeMs(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="duck"
                      type="checkbox"
                      checked={ducking}
                      onChange={(e) => setDucking(e.target.checked)}
                      className="h-4 w-4 rounded border-white/30 bg-white/10"
                    />
                    <label htmlFor="duck" className="text-sm text-white/70">
                      {t("studio.form.ducking")}
                    </label>
                  </div>
                  <div>
                    <label className={labelCls}>{t("studio.form.duckStrength")}</label>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      className={inputCls}
                      value={duckStr}
                      onChange={(e) => setDuckStr(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="bg-select">{t("studio.form.nasaBg")}</label>
                    <select
                      id="bg-select"
                      className={inputCls}
                      value={nasaBgName}
                      onChange={(e) => setNasaBgName(e.target.value)}
                    >
                      <option value="" className="bg-zinc-900">
                        {t("studio.form.nasaBgNone")}
                      </option>
                      {backgrounds.map((name) => (
                        <option key={name} value={name} className="bg-zinc-900">
                          {name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-white/40">{t("studio.form.nasaBgHint")}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="gen-use-lstm"
                      type="checkbox"
                      checked={useLstm && mode === "ai"}
                      disabled={mode !== "ai" || !caps?.lstm_checkpoint_ready}
                      onChange={(e) => setUseLstm(e.target.checked)}
                      className="h-4 w-4 rounded border-white/30 bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    <label
                      htmlFor="gen-use-lstm"
                      className={`text-sm ${mode !== "ai" || !caps?.lstm_checkpoint_ready ? "text-white/35" : "text-white/70"}`}
                    >
                      {t("studio.form.useLstm")}
                      {!caps?.lstm_checkpoint_ready ? (
                        <span className="ml-2 text-[11px] text-white/40">
                          ({t("studio.form.useLstmDisabled")})
                        </span>
                      ) : null}
                    </label>
                  </div>
                  {mode === "ai" && useLstm && caps?.lstm_checkpoint_ready ? (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="lstm-device">{t("studio.form.lstmDevice")}</label>
                        <select
                          id="lstm-device"
                          className={inputCls}
                          value={lstmDevice}
                          onChange={(e) => setLstmDevice(e.target.value as "cpu" | "cuda")}
                        >
                          <option value="cpu" className="bg-zinc-900">cpu</option>
                          <option value="cuda" className="bg-zinc-900">cuda</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="lstm-temp">
                          {t("studio.form.lstmTemperature", { value: lstmTemp.toFixed(2) })}
                        </label>
                        <input
                          id="lstm-temp"
                          type="range"
                          min={0.1}
                          max={1.8}
                          step={0.02}
                          value={lstmTemp}
                          onChange={(e) => setLstmTemp(Number(e.target.value))}
                          className="w-full accent-cyan-400"
                        />
                        <p className="mt-1 text-[11px] text-white/40">{t("studio.form.lstmTemperatureHint")}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={genLoading}
                onClick={() => void onGenerate()}
                className="font-display flex-1 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {genLoading ? t("studio.form.generating") : t("studio.form.generate")}
              </button>
              <button
                type="button"
                disabled={cmpLoading}
                onClick={() => void onCompare()}
                className="flex-1 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cmpLoading ? t("studio.form.comparing") : t("studio.form.compare")}
              </button>
            </div>
            {genLoading || cmpLoading ? (
              <div className="mt-4 space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-cyan-100/90">{t("studio.form.working")}</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/65">live</span>
                </div>
                <div className="skeleton-shimmer h-2 rounded-full" />
                <div className="space-y-2">
                  <div className="skeleton-shimmer h-3 w-2/3 rounded" />
                  <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                </div>
              </div>
            ) : null}
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/45">{t("studio.historyTitle")}</p>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[11px] text-white/50 transition hover:text-white/80"
                >
                  {t("studio.historyClear")}
                </button>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-white/40">{t("studio.historyEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => applyHistory(h)}
                      className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-xs text-white/70 transition hover:border-cyan-400/35 hover:text-white"
                    >
                      <span>{`${h.planet} · ${h.style} · ${h.days}d · ${h.kind}`}</span>
                      <span className="text-white/40">{t("studio.historyLoad")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

        <section className="space-y-6">
            {genError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                {genError}
              </div>
            ) : null}
            {genResult ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-white">{t("studio.results.generateTitle")}</h3>
                  {genResult.data_cached ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                      {t("studio.results.cachedBadge")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 ring-1 ring-cyan-400/30">
                      {t("studio.results.liveBadge")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/45">
                  {t("studio.results.points", { count: genResult.count })} · {genResult.planet} · {genResult.mode} ·{" "}
                  {genResult.style}
                </p>
                {genResult.fluid_render_warning ? (
                  <p className="mt-2 text-xs text-amber-200/90">{genResult.fluid_render_warning}</p>
                ) : null}
                {genResult.drone_signature ? (
                  <div className="mt-3 rounded-xl border border-purple-300/25 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-fuchsia-500/10 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-200/90">
                      {t("studio.results.droneSignature")}
                    </p>
                    <p className="mt-1 text-sm text-white/85">
                      {genResult.drone_signature.description}
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      {t("studio.results.droneFundamental", {
                        hz: genResult.drone_signature.fundamental_hz,
                        center: genResult.drone_signature.noise_center_hz,
                      })}
                    </p>
                  </div>
                ) : null}
                {genResult.lstm_blend && Object.keys(genResult.lstm_blend).length > 0 ? (
                  <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[10px] text-white/55">
                    {t("studio.results.lstmMeta")}: {JSON.stringify(genResult.lstm_blend)}
                  </pre>
                ) : null}
                {genResult.piano_roll && genResult.piano_roll.notes.length > 0 ? (
                  <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                        {t("studio.results.pianoRoll")}
                      </p>
                      <audio
                        ref={setGenAudio}
                        controls
                        preload="none"
                        className="h-9 w-full"
                        src={artifactUrl(apiBase, genResult.melody_wav) ?? undefined}
                      />
                    </div>
                    {artifactUrl(apiBase, genResult.melody_wav) ? (
                      <WaveformView
                        src={artifactUrl(apiBase, genResult.melody_wav) as string}
                        audio={genAudio}
                        accent={planetTheme.accent}
                        height={64}
                      />
                    ) : null}
                    <PianoRollPanel
                      data={genResult.piano_roll}
                      bpm={genResult.bpm ?? 96}
                      audio={genAudio}
                    />
                  </div>
                ) : null}
                {genResult.explanation ? (
                  <div className="mt-4">
                    <ExplainPanel explanation={genResult.explanation} />
                  </div>
                ) : null}
                <div className="mt-4 space-y-4">
                  <ArtifactLinks
                    apiBase={apiBase}
                    title={t("studio.results.files")}
                    midi={genResult.midi}
                    melody={genResult.melody_wav}
                    hq={genResult.melody_hq_wav}
                    hybrid={genResult.hybrid_wav}
                    t={t}
                  />
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
                      {t("studio.results.metrics")}
                    </p>
                    <MetricsTable metrics={genResult.sonification_metrics} />
                  </div>
                  <p className="break-all text-[11px] text-white/35">
                    <span className="text-white/50">{t("studio.results.dataPath")} </span>
                    {genResult.data_json}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/40">
                {t("studio.results.emptyGenerate")}
              </div>
            )}

            {cmpError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                {cmpError}
              </div>
            ) : null}
            {cmpResult ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-white">{t("studio.results.compareTitle")}</h3>
                  {cmpResult.data_cached ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                      {t("studio.results.cachedBadge")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 ring-1 ring-cyan-400/30">
                      {t("studio.results.liveBadge")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/45">
                  {t("studio.results.points", { count: cmpResult.count })} · {cmpResult.planet} · {cmpResult.style}
                </p>
                {cmpResult.fluid_render_warning ? (
                  <p className="mt-2 text-xs text-amber-200/90">{cmpResult.fluid_render_warning}</p>
                ) : null}
                {cmpResult.lstm_blend_ai ? (
                  <pre className="mt-2 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[10px] text-white/55">
                    {t("studio.results.lstmMetaAi")}: {JSON.stringify(cmpResult.lstm_blend_ai)}
                  </pre>
                ) : null}
                {cmpResult.baseline.piano_roll && cmpResult.ai.piano_roll ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                        {t("studio.results.baseline")}
                      </p>
                      <audio
                        ref={setCmpBaseAudio}
                        controls
                        preload="none"
                        className="h-9 w-full"
                        src={artifactUrl(apiBase, cmpResult.baseline.melody_wav) ?? undefined}
                      />
                      {artifactUrl(apiBase, cmpResult.baseline.melody_wav) ? (
                        <WaveformView
                          src={artifactUrl(apiBase, cmpResult.baseline.melody_wav) as string}
                          audio={cmpBaseAudio}
                          accent="rgba(148, 163, 184, 0.85)"
                          height={56}
                        />
                      ) : null}
                      <PianoRollPanel
                        data={cmpResult.baseline.piano_roll}
                        bpm={cmpResult.bpm ?? 96}
                        audio={cmpBaseAudio}
                      />
                    </div>
                    <div
                      style={{
                        ...planetVars,
                        borderColor: "color-mix(in srgb, var(--planet-accent) 32%, transparent)",
                        background: "color-mix(in srgb, var(--planet-accent-soft) 80%, transparent)",
                      }}
                      className="space-y-2 rounded-2xl border p-3"
                    >
                      <p
                        className="text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: planetTheme.text }}
                      >
                        {t("studio.results.aiBranch")}
                      </p>
                      <audio
                        ref={setCmpAiAudio}
                        controls
                        preload="none"
                        className="h-9 w-full"
                        src={artifactUrl(apiBase, cmpResult.ai.melody_wav) ?? undefined}
                      />
                      {artifactUrl(apiBase, cmpResult.ai.melody_wav) ? (
                        <WaveformView
                          src={artifactUrl(apiBase, cmpResult.ai.melody_wav) as string}
                          audio={cmpAiAudio}
                          accent={planetTheme.accent}
                          height={56}
                        />
                      ) : null}
                      <PianoRollPanel
                        data={cmpResult.ai.piano_roll}
                        bpm={cmpResult.bpm ?? 96}
                        audio={cmpAiAudio}
                      />
                    </div>
                  </div>
                ) : null}
                {cmpResult.ai.explanation || cmpResult.baseline.explanation ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {cmpResult.baseline.explanation ? (
                      <ExplainPanel explanation={cmpResult.baseline.explanation} initialCollapsed />
                    ) : null}
                    {cmpResult.ai.explanation ? (
                      <ExplainPanel explanation={cmpResult.ai.explanation} initialCollapsed />
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <ArtifactLinks
                    apiBase={apiBase}
                    title={t("studio.results.baseline")}
                    midi={cmpResult.baseline.midi}
                    melody={cmpResult.baseline.melody_wav}
                    hq={cmpResult.baseline.melody_hq_wav}
                    hybrid={cmpResult.baseline.hybrid_wav}
                    t={t}
                  />
                  <ArtifactLinks
                    apiBase={apiBase}
                    title={t("studio.results.aiBranch")}
                    midi={cmpResult.ai.midi}
                    melody={cmpResult.ai.melody_wav}
                    hq={cmpResult.ai.melody_hq_wav}
                    hybrid={cmpResult.ai.hybrid_wav}
                    t={t}
                  />
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
                    {t("studio.results.deltaTitle")}
                  </p>
                  <MetricsTable metrics={cmpResult.comparison_summary as unknown as Record<string, number>} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <p className="mb-2 text-xs text-white/45">{t("studio.results.metricsBaseline")}</p>
                    <MetricsTable metrics={cmpResult.baseline.sonification_metrics} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-white/45">{t("studio.results.metricsAi")}</p>
                    <MetricsTable metrics={cmpResult.ai.sonification_metrics} />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
    </>
  );
}
