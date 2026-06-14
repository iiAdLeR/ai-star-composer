import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "@/components/ui/Toast";
import {
  type EvaluationMetricReport,
  type EvaluationReport,
  type EvaluationRequestBody,
  PLANETS,
  fetchEvaluationLatest,
  runEvaluation,
} from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";

/**
 * Quality / statistics dashboard.
 *
 * Surfaces `docs/evaluation_raw.json` (or a fresh on-demand run) so the jury
 * can see the AI vs baseline Wilcoxon results without leaving the app. Boxes
 * around p-values turn green when significant under α = 0.05.
 */

const STYLE_OPTIONS = ["calm", "pop", "study", "cinematic", "drone"] as const;
const DEFAULT_SEEDS = [7, 13, 19];

function fmtNumber(v: number | null | undefined, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return " - ";
  return v.toFixed(digits);
}

function fmtP(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return " - ";
  if (v < 0.0001) return "< 0.0001";
  return v.toFixed(4);
}

function isSignificant(r: EvaluationMetricReport, alpha = 0.05): boolean {
  return r.p_value != null && r.p_value < alpha;
}

function effectMagnitude(d: number | null | undefined): string {
  if (d == null) return " - ";
  const a = Math.abs(d);
  if (a < 0.2) return "tiny";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  if (a < 1.2) return "large";
  return "very large";
}

interface MetricRowProps {
  r: EvaluationMetricReport;
  alpha: number;
}

function MetricRow({ r, alpha }: MetricRowProps) {
  const sig = isSignificant(r, alpha);
  const arrow = r.mean_delta > 0 ? "▲" : r.mean_delta < 0 ? "▼" : "•";
  const dir = r.direction.includes(">") ? r.direction : "≈";
  const dirCls = !sig
    ? "text-white/45"
    : dir.startsWith("AI")
      ? "text-emerald-300"
      : "text-rose-300";
  return (
    <tr className={sig ? "bg-emerald-500/[0.04]" : ""}>
      <td className="px-3 py-2 font-mono text-[11px] text-white/85">{r.metric}</td>
      <td className="px-2 py-2 text-right text-[11px] font-mono text-white/55">{r.n}</td>
      <td className="px-2 py-2 text-right text-[11px] font-mono">
        <span className="text-white/85">{fmtNumber(r.baseline_mean, 4)}</span>
        <span className="text-white/35"> ±{fmtNumber(r.baseline_std, 3)}</span>
      </td>
      <td className="px-2 py-2 text-right text-[11px] font-mono">
        <span className="text-cyan-200/90">{fmtNumber(r.ai_mean, 4)}</span>
        <span className="text-white/35"> ±{fmtNumber(r.ai_std, 3)}</span>
      </td>
      <td className="px-2 py-2 text-right text-[11px] font-mono">
        <span className={r.mean_delta > 0 ? "text-emerald-200/90" : r.mean_delta < 0 ? "text-rose-200/90" : "text-white/50"}>
          {arrow} {fmtNumber(Math.abs(r.mean_delta), 4)}
        </span>
      </td>
      <td className="px-2 py-2 text-right text-[11px] font-mono">
        <span
          className={`inline-flex rounded-md px-1.5 py-0.5 ${
            sig ? "bg-emerald-500/20 text-emerald-100" : "bg-white/5 text-white/50"
          }`}
        >
          {fmtP(r.p_value)}
        </span>
      </td>
      <td className="px-2 py-2 text-right text-[11px] font-mono">
        {fmtNumber(r.cohens_dz, 3)}
        <span className="ml-1 text-[10px] text-white/35">({effectMagnitude(r.cohens_dz)})</span>
      </td>
      <td className={`px-2 py-2 text-right text-[11px] font-mono ${dirCls}`}>{dir}</td>
    </tr>
  );
}

export function QualityPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Run-configuration form (matches the backend grid validation).
  const [selPlanets, setSelPlanets] = useState<Set<string>>(new Set(["Earth", "Mars"]));
  const [selStyles, setSelStyles] = useState<Set<string>>(new Set(["calm", "cinematic"]));
  const [seedsRaw, setSeedsRaw] = useState<string>(DEFAULT_SEEDS.join(", "));
  const [days, setDays] = useState(30);

  const togglePlanet = (p: string) => {
    setSelPlanets((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const toggleStyle = (s: string) => {
    setSelStyles((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // Tick a once-per-second timer while a run is in flight so we can show
  // elapsed time without re-rendering on every animation frame.
  useEffect(() => {
    if (!loadingRun || !runStartedAt) return undefined;
    const id = window.setInterval(() => {
      setTickMs(Date.now() - runStartedAt);
    }, 250);
    return () => window.clearInterval(id);
  }, [loadingRun, runStartedAt]);

  const loadLatest = useCallback(async () => {
    setLoadingLatest(true);
    setError(null);
    try {
      const r = await fetchEvaluationLatest();
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLatest(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const seeds = useMemo(() => {
    return seedsRaw
      .split(/[,\s]+/)
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 2_000_000_000);
  }, [seedsRaw]);

  const totalPairs = selPlanets.size * selStyles.size * seeds.length;

  const onRun = useCallback(async () => {
    if (loadingRun) return;
    const body: EvaluationRequestBody = {
      planets: [...selPlanets],
      styles: [...selStyles],
      seeds,
      days,
    };
    if (totalPairs > 12) {
      toast.push(t("quality.toastTooLarge", { n: totalPairs }), { variant: "warning" });
      return;
    }
    if (totalPairs === 0) {
      toast.push(t("quality.toastEmpty"), { variant: "warning" });
      return;
    }
    setLoadingRun(true);
    setError(null);
    setRunStartedAt(Date.now());
    setTickMs(0);
    try {
      const r = await runEvaluation(body);
      setReport(r);
      toast.push(t("quality.toastDone", { n: r.pairs.length }), { variant: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.push(t("quality.toastFail", { message: msg }), { variant: "error", duration: 6000 });
    } finally {
      setLoadingRun(false);
      setRunStartedAt(null);
    }
  }, [days, loadingRun, seeds, selPlanets, selStyles, t, toast, totalPairs]);

  const significantCount = report?.reports.filter((r) => isSignificant(r, report?.config?.alpha ?? 0.05)).length ?? 0;
  const aiWinCount = report?.reports.filter((r) => r.direction.includes("AI >")).length ?? 0;
  const blWinCount = report?.reports.filter((r) => r.direction.includes("BL >")).length ?? 0;

  const reportConfig = report?.config;
  const formattedMtime = report?.report_mtime
    ? new Date(report.report_mtime * 1000).toLocaleString()
    : null;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("quality.title")}
        </h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-white/55">
          {t("quality.subtitle")}
        </p>
      </div>

      {/* Summary chips */}
      {report ? (
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryChip label={t("quality.chip.pairs")} value={String(report.pairs.length)} />
          <SummaryChip label={t("quality.chip.metrics")} value={String(report.reports.length)} />
          <SummaryChip
            label={t("quality.chip.significant")}
            value={String(significantCount)}
            tone="cyan"
          />
          <SummaryChip
            label={t("quality.chip.aiWinsBlWins")}
            value={`${aiWinCount} / ${blWinCount}`}
            tone="emerald"
          />
        </section>
      ) : null}

      {/* Run configuration */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{t("quality.runTitle")}</p>
          <p className="text-[11px] text-white/45">
            {t("quality.runHint", { max: 12 })}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">
              {t("quality.planets")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PLANETS.map((p) => {
                const theme = getPlanetTheme(p);
                const on = selPlanets.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlanet(p)}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition"
                    style={{
                      borderColor: on ? theme.accent : "rgba(255,255,255,0.15)",
                      background: on ? theme.accentSoft : "rgba(255,255,255,0.04)",
                      color: on ? theme.text : "rgba(255,255,255,0.55)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">
              {t("quality.styles")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTIONS.map((s) => {
                const on = selStyles.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStyle(s)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? "border-cyan-400/45 bg-cyan-500/15 text-cyan-100"
                        : "border-white/15 bg-white/[0.04] text-white/55 hover:text-white/80"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="seeds"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45"
              >
                {t("quality.seeds")}
              </label>
              <input
                id="seeds"
                value={seedsRaw}
                onChange={(e) => setSeedsRaw(e.target.value)}
                placeholder="7, 13, 19"
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            <div>
              <label
                htmlFor="eval-days"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45"
              >
                {t("quality.days")}
              </label>
              <input
                id="eval-days"
                type="number"
                min={7}
                max={120}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void onRun()}
                disabled={loadingRun || totalPairs === 0 || totalPairs > 12}
                className="font-display w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingRun
                  ? t("quality.running", { sec: Math.round(tickMs / 1000) })
                  : t("quality.runButton", { n: totalPairs })}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loadingLatest && !report ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/40">
          {t("quality.loading")}
        </div>
      ) : !report ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/45">
          {t("quality.noReport")}
        </div>
      ) : (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:p-5">
          {reportConfig ? (
            <p className="text-[11px] text-white/45">
              {t("quality.reportConfig", {
                planets: reportConfig.planets.join(", "),
                styles: reportConfig.styles.join(", "),
                seeds: reportConfig.seeds.join(", "),
                days: String(reportConfig.days),
                alpha: String(reportConfig.alpha),
              })}
            </p>
          ) : formattedMtime ? (
            <p className="text-[11px] text-white/45">
              {t("quality.reportPersisted", { when: formattedMtime })}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/45">
                  <th className="px-3 py-2 font-medium">{t("quality.col.metric")}</th>
                  <th className="px-2 py-2 text-right font-medium">N</th>
                  <th className="px-2 py-2 text-right font-medium">{t("quality.col.baseline")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("quality.col.ai")}</th>
                  <th className="px-2 py-2 text-right font-medium">Δ</th>
                  <th className="px-2 py-2 text-right font-medium">p</th>
                  <th className="px-2 py-2 text-right font-medium">d_z</th>
                  <th className="px-2 py-2 text-right font-medium">{t("quality.col.direction")}</th>
                </tr>
              </thead>
              <tbody>
                {report.reports.map((r) => (
                  <MetricRow key={r.metric} r={r} alpha={reportConfig?.alpha ?? 0.05} />
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-white/10 bg-black/30 p-3">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-white/55">
              {t("quality.legend")}
            </summary>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-white/55">
              <li>
                <b className="text-white/80">N</b> - {t("quality.legend.n")}
              </li>
              <li>
                <b className="text-white/80">p</b> - {t("quality.legend.p")}
              </li>
              <li>
                <b className="text-white/80">d_z</b> - {t("quality.legend.dz")}
              </li>
              <li>
                <b className="text-white/80">Δ</b> - {t("quality.legend.delta")}
              </li>
              <li>
                <b className="text-emerald-300">AI &gt; BL *</b> / <b className="text-rose-300">BL &gt; AI *</b>  - {" "}
                {t("quality.legend.direction")}
              </li>
            </ul>
          </details>
        </section>
      )}
    </>
  );
}

interface SummaryChipProps {
  label: string;
  value: string;
  tone?: "default" | "cyan" | "emerald";
}

function SummaryChip({ label, value, tone = "default" }: SummaryChipProps) {
  const toneCls =
    tone === "cyan"
      ? "border-cyan-400/35 bg-cyan-500/10 text-cyan-100"
      : tone === "emerald"
        ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
        : "border-white/10 bg-white/[0.05] text-white/85";
  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneCls}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
