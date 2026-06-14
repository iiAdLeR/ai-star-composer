import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExplainPanel } from "@/components/studio/ExplainPanel";
import { PianoRollPanel } from "@/components/studio/PianoRoll";
import { WaveformView } from "@/components/studio/WaveformView";
import { useToast } from "@/components/ui/Toast";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { getApiBase } from "@/lib/apiBase";
import {
  PLANETS,
  type ComparePlanetsResponse,
  type GenerateResponse,
  type MetricDelta,
  comparePlanets,
} from "@/lib/api";
import { artifactUrl } from "@/lib/artifacts";
import { getPlanetTheme } from "@/lib/planetTheme";

/**
 * Compare two planets side-by-side. Same days/seed/style on both branches
 * so the only thing changing is the planet itself.
 *
 * The page surfaces three layers of differences:
 *   • Audio (with waveform + piano roll on each side)
 *   • Physical properties from the encyclopedia
 *   • Sonification metrics (delta table)
 *
 * Designed to be the **single most convincing demo** for a science teacher:
 * play both at once, then read the delta table to see which physical
 * differences caused which musical differences.
 */

const STYLES = ["calm", "pop", "study", "cinematic", "drone"] as const;

const PHYSICS_FIELD_LABELS: Record<string, string> = {
  mean_distance_au: "Mean distance (AU)",
  orbital_period_days: "Orbital period (days)",
  rotation_period_hours: "Rotation period (h)",
  axial_tilt_deg: "Axial tilt (°)",
  eccentricity: "Eccentricity",
  mean_radius_km: "Mean radius (km)",
  gravity_g: "Surface gravity (g)",
};

export function ComparePlanetsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const track = useAchievementTracker();

  const [planetA, setPlanetA] = useState<(typeof PLANETS)[number]>("Mercury");
  const [planetB, setPlanetB] = useState<(typeof PLANETS)[number]>("Neptune");
  const [days, setDays] = useState(14);
  const [seed, setSeed] = useState(7);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("calm");
  const [mode, setMode] = useState<"baseline" | "ai">("baseline");

  const [result, setResult] = useState<ComparePlanetsResponse | null>(null);
  const [running, setRunning] = useState(false);

  const [audioA, setAudioA] = useState<HTMLAudioElement | null>(null);
  const [audioB, setAudioB] = useState<HTMLAudioElement | null>(null);

  const onCompare = useCallback(async () => {
    if (planetA === planetB) {
      toast.push(t("compare.toastSame"), { variant: "error" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const r = await comparePlanets({
        planet_a: planetA,
        planet_b: planetB,
        days,
        seed,
        style_id: style,
        mode,
      });
      setResult(r);
      track("encyclopedia:compare", { planet: planetA });
      track("encyclopedia:compare", { planet: planetB });
      toast.push(t("compare.toastDone", { a: planetA, b: planetB }), { variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.push(t("compare.toastFail", { message: msg }), { variant: "error", duration: 6000 });
    } finally {
      setRunning(false);
    }
  }, [days, mode, planetA, planetB, seed, style, t, toast]);

  // Play both simultaneously — a single button that gets/syncs the two audio elements.
  const playBoth = useCallback(() => {
    if (!audioA || !audioB) return;
    audioA.currentTime = 0;
    audioB.currentTime = 0;
    void audioA.play();
    void audioB.play();
  }, [audioA, audioB]);

  const themeA = getPlanetTheme(planetA);
  const themeB = getPlanetTheme(planetB);

  return (
    <>
      <header className="mb-6">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("compare.kicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("compare.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("compare.subtitle")}
        </p>
      </header>

      {/* Picker */}
      <section className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:grid-cols-2 sm:p-6">
        <PlanetPicker label={t("compare.planetA")} value={planetA} onChange={setPlanetA} theme={themeA} />
        <PlanetPicker label={t("compare.planetB")} value={planetB} onChange={setPlanetB} theme={themeB} />

        <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label={t("compare.days")}>
            <input
              type="number"
              min={1}
              max={120}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            />
          </Field>
          <Field label={t("compare.seed")}>
            <input
              type="number"
              min={0}
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            />
          </Field>
          <Field label={t("compare.style")}>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as (typeof STYLES)[number])}
              className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("compare.mode")}>
            <div className="flex gap-1 rounded-xl border border-white/15 bg-white/[0.04] p-1">
              {(["baseline", "ai"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    mode === m
                      ? "bg-gradient-to-r from-violet-600/45 to-cyan-600/35 text-white ring-1 ring-white/15"
                      : "text-white/55 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onCompare()}
            disabled={running}
            className="font-display flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? t("compare.running") : `♪ ${t("compare.run")}`}
          </button>
          {result ? (
            <button
              type="button"
              onClick={playBoth}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/[0.08] px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/55 hover:bg-cyan-500/15"
            >
              {t("compare.playBoth")}
            </button>
          ) : null}
        </div>
      </section>

      {/* Results */}
      {result ? (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlanetCard
              data={result.planet_a}
              theme={themeA}
              setAudio={setAudioA}
              audio={audioA}
            />
            <PlanetCard
              data={result.planet_b}
              theme={themeB}
              setAudio={setAudioB}
              audio={audioB}
            />
          </section>

          {/* Physics delta */}
          {Object.keys(result.comparison.physics_delta).length > 0 ? (
            <Card title={t("compare.physicsTitle")}>
              <p className="mb-3 text-xs leading-relaxed text-white/55">{t("compare.physicsHint")}</p>
              <DeltaTable
                rows={Object.entries(result.comparison.physics_delta).map(([key, d]) => ({
                  key,
                  label: PHYSICS_FIELD_LABELS[key] || key,
                  a: d.a,
                  b: d.b,
                  delta: d.delta,
                  rel: d.a !== 0 ? d.delta / Math.abs(d.a) : null,
                }))}
                themeA={themeA}
                themeB={themeB}
                aLabel={result.planet_a.planet}
                bLabel={result.planet_b.planet}
              />
            </Card>
          ) : null}

          {/* Metrics delta */}
          <Card title={t("compare.metricsTitle")}>
            <p className="mb-3 text-xs leading-relaxed text-white/55">{t("compare.metricsHint")}</p>
            <DeltaTable
              rows={Object.entries(result.comparison.metrics_delta).map(([key, d]: [string, MetricDelta]) => ({
                key,
                label: key,
                a: d.a,
                b: d.b,
                delta: d.delta,
                rel: d.rel,
              }))}
              themeA={themeA}
              themeB={themeB}
              aLabel={result.planet_a.planet}
              bLabel={result.planet_b.planet}
            />
          </Card>

          {/* Explanations side-by-side */}
          {result.planet_a.explanation || result.planet_b.explanation ? (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {result.planet_a.explanation ? <ExplainPanel explanation={result.planet_a.explanation} initialCollapsed /> : <div />}
              {result.planet_b.explanation ? <ExplainPanel explanation={result.planet_b.explanation} initialCollapsed /> : <div />}
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PlanetCard({
  data,
  theme,
  audio,
  setAudio,
}: {
  data: GenerateResponse;
  theme: ReturnType<typeof getPlanetTheme>;
  audio: HTMLAudioElement | null;
  setAudio: (el: HTMLAudioElement | null) => void;
}) {
  const apiBase = getApiBase();
  return (
    <article
      className="space-y-3 rounded-2xl border bg-white/[0.03] p-4 backdrop-blur-md sm:p-5"
      style={{
        borderColor: `color-mix(in srgb, ${theme.accent} 30%, rgba(255,255,255,0.10))`,
      }}
    >
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-semibold tracking-tight" style={{ color: theme.text }}>
          {data.planet}
        </h3>
        <span className="text-[11px] text-white/45">{data.count} samples · {data.bpm} BPM</span>
      </header>
      <audio
        ref={(el) => setAudio(el)}
        controls
        preload="none"
        className="h-9 w-full"
        src={artifactUrl(apiBase, data.melody_wav) ?? undefined}
      />
      {artifactUrl(apiBase, data.melody_wav) ? (
        <WaveformView
          src={artifactUrl(apiBase, data.melody_wav) as string}
          audio={audio}
          accent={theme.accent}
          height={50}
        />
      ) : null}
      {data.piano_roll ? <PianoRollPanel data={data.piano_roll} bpm={data.bpm ?? 96} audio={audio} /> : null}
    </article>
  );
}

interface DeltaRow {
  key: string;
  label: string;
  a: number;
  b: number;
  delta: number;
  rel: number | null;
}

function DeltaTable({
  rows,
  themeA,
  themeB,
  aLabel,
  bLabel,
}: {
  rows: DeltaRow[];
  themeA: ReturnType<typeof getPlanetTheme>;
  themeB: ReturnType<typeof getPlanetTheme>;
  aLabel: string;
  bLabel: string;
}) {
  const fmt = (n: number, digits = 4) => {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(digits)}×10⁶`;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-xs">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/45">
            <th className="py-1.5 text-left">Metric</th>
            <th className="py-1.5 text-right" style={{ color: themeA.text }}>{aLabel}</th>
            <th className="py-1.5 text-right" style={{ color: themeB.text }}>{bLabel}</th>
            <th className="py-1.5 text-right">Δ (B − A)</th>
            <th className="py-1.5 text-right">Δ %</th>
          </tr>
        </thead>
        <tbody className="font-mono text-white/85">
          {rows.map((r) => {
            const direction = Math.abs(r.delta) < 1e-9 ? "≈" : r.delta > 0 ? "↑" : "↓";
            return (
              <tr key={r.key} className="border-b border-white/5">
                <td className="py-1.5 pr-3 text-white/85">{r.label}</td>
                <td className="py-1.5 text-right">{fmt(r.a)}</td>
                <td className="py-1.5 text-right">{fmt(r.b)}</td>
                <td className="py-1.5 text-right">
                  <span className={r.delta > 0 ? "text-cyan-200" : r.delta < 0 ? "text-pink-300" : "text-white/55"}>
                    {direction} {fmt(r.delta)}
                  </span>
                </td>
                <td className="py-1.5 text-right text-white/65">
                  {r.rel !== null && Number.isFinite(r.rel)
                    ? `${(r.rel * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlanetPicker({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: (typeof PLANETS)[number];
  onChange: (p: (typeof PLANETS)[number]) => void;
  theme: ReturnType<typeof getPlanetTheme>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {PLANETS.map((p) => {
          const active = p === value;
          const t = active ? theme : getPlanetTheme(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${active ? "" : "opacity-65 hover:opacity-100"}`}
              style={{
                borderColor: `color-mix(in srgb, ${t.accent} ${active ? "55%" : "30%"}, transparent)`,
                background: t.accentSoft,
                color: t.text,
              }}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:p-6">
      <h2 className="font-display mb-3 text-base font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      {children}
    </div>
  );
}
