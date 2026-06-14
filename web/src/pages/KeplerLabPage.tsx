import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { OrbitSvg } from "@/components/lab/OrbitSvg";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { tabClasses } from "@/components/ui/Tabs";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { type OrbitPreview, fetchOrbitPreview } from "@/lib/api";

/**
 * Three-lab walkthrough of Kepler's laws.
 *
 * Each tab is a self-contained mini-lesson:
 *   1. Ellipse — vary e, watch the orbit deform.
 *   2. Equal areas — sweep wedges, see speed change.
 *   3. Period vs distance — compare two orbits, watch T² / a³ stay constant.
 *
 * Designed to be readable in a classroom: every numeric value visible, every
 * slider labeled, every visual matched with a one-line explanation.
 */

type Law = "1" | "2" | "3";
const LAWS: Law[] = ["1", "2", "3"];

export function KeplerLabPage() {
  const { t } = useTranslation();
  const [law, setLaw] = useState<Law>("1");
  const track = useAchievementTracker();
  useEffect(() => {
    track("kepler:visited");
  }, [track]);

  return (
    <>
      <header className="mb-6">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("kepler.kicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("kepler.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("kepler.subtitle")}
        </p>
      </header>

      <nav
        className="mb-6 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1"
        aria-label={t("kepler.tabsAria")}
      >
        {LAWS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setLaw(id)}
            className={tabClasses(law === id, "sm")}
          >
            {t(`kepler.law${id}.tab`)}
          </button>
        ))}
      </nav>

      {law === "1" && <Law1 />}
      {law === "2" && <Law2 />}
      {law === "3" && <Law3 />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Law 1 — The Law of Ellipses
// ---------------------------------------------------------------------------
function Law1() {
  const { t } = useTranslation();
  const [e, setE] = useState(0.1);
  const [preview, setPreview] = useState<OrbitPreview | null>(null);

  useEffect(() => {
    // Kepler math runs locally now — no debounce needed, slider feels instant.
    void fetchOrbitPreview(1.0, e, 240).then(setPreview);
  }, [e]);

  return (
    <article className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <h2 className="font-display mb-2 text-lg font-semibold tracking-tight text-white">
          {t("kepler.law1.title")}
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-white/80">{t("kepler.law1.lead")}</p>
        <p className="mb-4 text-xs leading-relaxed text-white/55">
          {t("kepler.law1.body1")}{" "}
          <GlossaryTerm id="eccentricity">{t("kepler.law1.term.e")}</GlossaryTerm>
          {t("kepler.law1.body2")}
        </p>
        <SliderRow
          label={t("kepler.law1.eLabel")}
          value={e}
          min={0}
          max={0.85}
          step={0.001}
          onChange={setE}
          displayValue={e.toFixed(3)}
        />
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/65">
          <li>{t("kepler.law1.bullet1", { v: (1 - e).toFixed(3), a: 1 })}</li>
          <li>{t("kepler.law1.bullet2", { v: (1 + e).toFixed(3), a: 1 })}</li>
          <li>{t("kepler.law1.bullet3")}</li>
        </ul>
      </Card>
      <Card>
        <OrbitSvg preview={preview} height={320} />
        <p className="mt-3 text-[11px] text-white/45">{t("kepler.law1.caption")}</p>
      </Card>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Law 2 — The Law of Equal Areas
// ---------------------------------------------------------------------------
function Law2() {
  const { t } = useTranslation();
  const [e, setE] = useState(0.5);
  const [wedges, setWedges] = useState(6);
  const [preview, setPreview] = useState<OrbitPreview | null>(null);

  useEffect(() => {
    void fetchOrbitPreview(1.5, e, 360).then(setPreview);
  }, [e]);

  const speedRatio = preview ? preview.max_speed_km_s / Math.max(preview.min_speed_km_s, 0.001) : null;

  return (
    <article className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <h2 className="font-display mb-2 text-lg font-semibold tracking-tight text-white">
          {t("kepler.law2.title")}
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-white/80">{t("kepler.law2.lead")}</p>
        <p className="mb-4 text-xs leading-relaxed text-white/55">
          {t("kepler.law2.body1")}{" "}
          <GlossaryTerm id="perihelion">{t("kepler.law2.term.peri")}</GlossaryTerm>
          {t("kepler.law2.body2")}{" "}
          <GlossaryTerm id="aphelion">{t("kepler.law2.term.ap")}</GlossaryTerm>
          {t("kepler.law2.body3")}
        </p>
        <SliderRow
          label={t("kepler.law2.eLabel")}
          value={e}
          min={0}
          max={0.85}
          step={0.001}
          onChange={setE}
          displayValue={e.toFixed(3)}
        />
        <SliderRow
          label={t("kepler.law2.wedgesLabel")}
          value={wedges}
          min={3}
          max={12}
          step={1}
          onChange={(v) => setWedges(Math.round(v))}
          displayValue={`${wedges}`}
        />
        {speedRatio ? (
          <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] p-3 text-sm text-cyan-100">
            {t("kepler.law2.ratio", { ratio: speedRatio.toFixed(2) })}
          </div>
        ) : null}
      </Card>
      <Card>
        <OrbitSvg preview={preview} sweepCount={wedges} height={320} />
        <p className="mt-3 text-[11px] text-white/45">{t("kepler.law2.caption")}</p>
      </Card>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Law 3 — Period vs. distance
// ---------------------------------------------------------------------------
function Law3() {
  const { t } = useTranslation();
  const [a1, setA1] = useState(1.0);
  const [a2, setA2] = useState(5.2);
  const [p1, setP1] = useState<OrbitPreview | null>(null);
  const [p2, setP2] = useState<OrbitPreview | null>(null);

  useEffect(() => {
    void fetchOrbitPreview(a1, 0.05, 240).then(setP1);
  }, [a1]);
  useEffect(() => {
    void fetchOrbitPreview(a2, 0.05, 240).then(setP2);
  }, [a2]);

  const ratio = (period: number, a: number) => Math.pow(period / 365.25, 2) / Math.pow(a, 3);

  return (
    <article className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card>
        <h2 className="font-display mb-2 text-lg font-semibold tracking-tight text-white">
          {t("kepler.law3.title")}
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-white/80">{t("kepler.law3.lead")}</p>
        <p className="mb-4 text-xs leading-relaxed text-white/55">
          {t("kepler.law3.body")}{" "}
          <GlossaryTerm id="kepler-laws">{t("kepler.law3.term")}</GlossaryTerm>.
        </p>

        <SliderRow
          label={t("kepler.law3.a1Label")}
          value={a1}
          min={0.4}
          max={30}
          step={0.01}
          onChange={setA1}
          displayValue={`${a1.toFixed(2)} AU`}
          logScale
        />
        <SliderRow
          label={t("kepler.law3.a2Label")}
          value={a2}
          min={0.4}
          max={30}
          step={0.01}
          onChange={setA2}
          displayValue={`${a2.toFixed(2)} AU`}
          logScale
        />

        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/45">
              <th className="py-1.5 text-left">{t("kepler.law3.colObj")}</th>
              <th className="py-1.5 text-right">a (AU)</th>
              <th className="py-1.5 text-right">T (yr)</th>
              <th className="py-1.5 text-right">T²/a³</th>
            </tr>
          </thead>
          <tbody className="font-mono text-white/85">
            {p1 ? (
              <tr className="border-b border-white/5">
                <td className="py-1.5 text-cyan-200">A</td>
                <td className="py-1.5 text-right">{a1.toFixed(2)}</td>
                <td className="py-1.5 text-right">{(p1.period_days / 365.25).toFixed(2)}</td>
                <td className="py-1.5 text-right">{ratio(p1.period_days, a1).toFixed(3)}</td>
              </tr>
            ) : null}
            {p2 ? (
              <tr>
                <td className="py-1.5 text-pink-300">B</td>
                <td className="py-1.5 text-right">{a2.toFixed(2)}</td>
                <td className="py-1.5 text-right">{(p2.period_days / 365.25).toFixed(2)}</td>
                <td className="py-1.5 text-right">{ratio(p2.period_days, a2).toFixed(3)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-cyan-100/85">{t("kepler.law3.takeaway")}</p>
      </Card>
      <Card>
        <OrbitSvg preview={p1} secondary={p2} height={340} />
        <p className="mt-3 text-[11px] text-white/45">{t("kepler.law3.caption")}</p>
      </Card>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:p-6">
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  logScale = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
  logScale?: boolean;
}) {
  const sliderValue = logScale ? Math.log(value) : value;
  const sliderMin = logScale ? Math.log(min) : min;
  const sliderMax = logScale ? Math.log(max) : max;
  return (
    <div className="mb-3">
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
    </div>
  );
}
