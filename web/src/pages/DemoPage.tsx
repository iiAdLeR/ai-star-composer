import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExplainPanel } from "@/components/studio/ExplainPanel";
import { PianoRollPanel } from "@/components/studio/PianoRoll";
import { WaveformView } from "@/components/studio/WaveformView";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { getPlanetTheme } from "@/lib/planetTheme";
import {
  type GeneratePayload,
  type GenerateResponse,
  exportBundleUrl,
  postGenerate,
} from "@/lib/api";
import { getApiBase } from "@/lib/apiBase";
import { artifactUrl } from "@/lib/artifacts";

/**
 * "Demo Mode": one click, presentation-friendly walkthrough.
 *
 * Generates a curated tour of three planets × calm style at a fixed seed
 * (so the committee can reproduce results), shows progress per step, and
 * auto-plays each piano-roll-backed clip in sequence. Everything runs against
 * `/generate`, no separate endpoint — the NASA Horizons cache means runs 2+ of
 * the same window come back in ~12ms.
 */

interface DemoStep {
  id: string;
  planet: string;
  days: number;
  seed: number;
  styleId: "calm" | "cinematic" | "pop";
}

const DEMO_STEPS: DemoStep[] = [
  { id: "earth", planet: "Earth", days: 30, seed: 42, styleId: "calm" },
  { id: "mars", planet: "Mars", days: 30, seed: 42, styleId: "cinematic" },
  { id: "jupiter", planet: "Jupiter", days: 30, seed: 42, styleId: "pop" },
];

type StepStatus = "idle" | "loading" | "ready" | "error";

interface StepState {
  status: StepStatus;
  response?: GenerateResponse;
  error?: string;
  durationMs?: number;
}

const INITIAL_STATE: Record<string, StepState> = Object.fromEntries(
  DEMO_STEPS.map((s) => [s.id, { status: "idle" as StepStatus }]),
);

export function DemoPage() {
  const { t } = useTranslation();
  const apiBase = useMemo(() => getApiBase(), []);
  const [states, setStates] = useState<Record<string, StepState>>(INITIAL_STATE);
  const [activeIdx, setActiveIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const track = useAchievementTracker();
  useEffect(() => {
    track("demo:visited");
  }, [track]);
  // State mirror for PianoRollPanel binding (re-renders when the audio mounts).
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const runOne = useCallback(
    async (step: DemoStep) => {
      setStates((prev) => ({ ...prev, [step.id]: { status: "loading" } }));
      const t0 = performance.now();
      try {
        const payload: GeneratePayload = {
          planet: step.planet,
          days: step.days,
          mode: "ai",
          style: step.styleId,
          seed: step.seed,
          fg_gain: 0.85,
          bg_gain: 0.25,
          fade_ms: 80,
          ducking: true,
          ducking_strength: 0.45,
        };
        const res = await postGenerate(payload);
        const dt = Math.round(performance.now() - t0);
        setStates((prev) => ({
          ...prev,
          [step.id]: { status: "ready", response: res, durationMs: dt },
        }));
        return res;
      } catch (e) {
        setStates((prev) => ({
          ...prev,
          [step.id]: {
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          },
        }));
        return null;
      }
    },
    [],
  );

  const startDemo = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setStates(INITIAL_STATE);
    for (let i = 0; i < DEMO_STEPS.length; i += 1) {
      setActiveIdx(i);
      await runOne(DEMO_STEPS[i]);
    }
    setRunning(false);
  }, [running, runOne]);

  // Auto-play handoff: when the current clip ends, advance to the next ready clip.
  useEffect(() => {
    if (!audioEl || !autoPlay) return;
    const onEnded = () => {
      const next = activeIdx + 1;
      if (next < DEMO_STEPS.length) {
        const nextState = states[DEMO_STEPS[next].id];
        if (nextState?.status === "ready") setActiveIdx(next);
      }
    };
    audioEl.addEventListener("ended", onEnded);
    return () => audioEl.removeEventListener("ended", onEnded);
  }, [audioEl, autoPlay, activeIdx, states]);

  // When the active step becomes ready (or we navigate to a ready step) and
  // autoplay is on, kick the audio.
  useEffect(() => {
    if (!audioEl || !autoPlay) return;
    const active = states[DEMO_STEPS[activeIdx]?.id];
    if (active?.status === "ready") {
      // Tiny delay so the new src is loaded.
      const id = window.setTimeout(() => void audioEl.play().catch(() => undefined), 120);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [audioEl, autoPlay, activeIdx, states]);

  const activeStep = DEMO_STEPS[activeIdx];
  const activeState = states[activeStep.id];
  const activeRes = activeState?.response;
  const activeMelodyUrl = activeRes ? artifactUrl(apiBase, activeRes.melody_wav) : null;
  const activeBundleUrl = activeRes ? exportBundleUrl(apiBase, activeRes.midi) : null;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("demo.title")}
        </h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-white/55">
          {t("demo.subtitle")}
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{t("demo.controlsTitle")}</p>
            <p className="mt-1 text-xs text-white/55">{t("demo.controlsHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-white/65">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => setAutoPlay(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/10"
              />
              {t("demo.autoPlay")}
            </label>
            <button
              type="button"
              onClick={() => void startDemo()}
              disabled={running}
              className="font-display rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? t("demo.running") : t("demo.start")}
            </button>
          </div>
        </div>
      </section>

      <ol className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DEMO_STEPS.map((step, idx) => {
          const s = states[step.id];
          const isActive = idx === activeIdx;
          let badge = t("demo.statusIdle");
          let badgeCls = "bg-white/5 text-white/45";
          if (s?.status === "loading") {
            badge = t("demo.statusLoading");
            badgeCls = "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30";
          } else if (s?.status === "ready") {
            badge = t("demo.statusReady", { ms: String(s.durationMs ?? "") });
            badgeCls = "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30";
          } else if (s?.status === "error") {
            badge = t("demo.statusError");
            badgeCls = "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30";
          }
          return (
            <li
              key={step.id}
              className={`rounded-2xl border p-4 transition ${
                isActive
                  ? "border-cyan-400/60 bg-cyan-500/[0.06] shadow-lg shadow-cyan-500/10"
                  : "border-white/10 bg-white/[0.04] hover:border-white/20"
              }`}
            >
              <button
                type="button"
                onClick={() => s?.status === "ready" && setActiveIdx(idx)}
                disabled={s?.status !== "ready"}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-semibold text-white">
                    {idx + 1}. {step.planet}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${badgeCls}`}>
                    {badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/55">
                  {step.styleId} · {step.days}d · seed {step.seed}
                </p>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
        {activeRes && activeRes.piano_roll && activeRes.piano_roll.notes.length > 0 ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  {activeStep.planet} · {activeRes.style}
                </h2>
                <p className="mt-0.5 text-xs text-white/45">
                  {t("studio.results.points", { count: activeRes.count })} ·{" "}
                  {activeRes.data_cached ? t("studio.results.cachedBadge") : t("studio.results.liveBadge")}
                </p>
              </div>
              {activeBundleUrl ? (
                <a
                  href={activeBundleUrl}
                  download
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
                >
                  {t("studio.artifacts.bundle")}
                </a>
              ) : null}
            </div>
            <div className="mt-4 space-y-2">
              <audio
                ref={(el) => {
                  audioRef.current = el;
                  setAudioEl(el);
                }}
                controls
                preload="auto"
                className="h-9 w-full"
                src={activeMelodyUrl ?? undefined}
              />
              {activeMelodyUrl ? (
                <WaveformView
                  src={activeMelodyUrl}
                  audio={audioEl}
                  accent={getPlanetTheme(activeStep.planet).accent}
                  height={64}
                />
              ) : null}
              <PianoRollPanel
                data={activeRes.piano_roll}
                bpm={activeRes.bpm ?? 96}
                audio={audioEl}
              />
            </div>
            {activeRes.explanation ? (
              <div className="mt-4">
                <ExplainPanel explanation={activeRes.explanation} initialCollapsed />
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(180px,100%),1fr))] gap-2 text-[11px] font-mono text-white/55">
              {Object.entries(activeRes.sonification_metrics)
                .slice(0, 8)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                    <p className="break-all text-[10px] uppercase tracking-wider text-white/40">{k}</p>
                    <p className="mt-0.5 tabular-nums text-cyan-200/85">
                      {typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : String(v)}
                    </p>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <div className="text-center text-sm text-white/45">
            {activeState?.status === "loading"
              ? t("demo.loadingActive", { planet: activeStep.planet })
              : t("demo.emptyState")}
          </div>
        )}
      </section>
    </>
  );
}
