import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { NarrateButton } from "@/components/ui/NarrateButton";
import type { ExplanationRule, SonificationExplanation } from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";

// Map well-known rule ids to glossary entries so the panel quietly teaches.
const RULE_GLOSSARY: Record<string, string> = {
  speed_to_pitch: "pitch",
  intensity_to_velocity: "velocity",
  distance_to_register: "octave",
  duration_distribution: "bpm",
  ai_transitions: "lstm",
  baseline_purity: "sonification",
};

/**
 * "Why does this sound like this?" panel.
 *
 * Renders the structured `SonificationExplanation` from the backend as a
 * collapsible card with planet signature, data window, and per-rule
 * input → output mapping. Designed to feel like a museum placard rather
 * than a debug dump.
 */

function formatValue(v: ExplanationRule["input_value"]): string {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "number" ? x.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(x))).join(" → ");
  }
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(v);
}

export interface ExplainPanelProps {
  explanation: SonificationExplanation;
  className?: string;
  /** Optional initial collapsed state. Defaults to expanded for the jury. */
  initialCollapsed?: boolean;
}

export function ExplainPanel({ explanation, className, initialCollapsed = false }: ExplainPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!initialCollapsed);
  const [openRule, setOpenRule] = useState<string | null>(null);

  const planetName = explanation.planet_signature.planet;
  const theme = getPlanetTheme(planetName as Parameters<typeof getPlanetTheme>[0]);

  // Build a single narration script combining headline + planet-signature + each rule.
  const narration = useMemo(() => {
    const parts: string[] = [];
    parts.push(explanation.headline);
    parts.push(explanation.planet_signature.why);
    for (const r of explanation.rules) {
      parts.push(`${r.title}. ${r.summary}`);
    }
    return parts.join(" ");
  }, [explanation]);

  return (
    <section
      className={`rounded-2xl border bg-black/30 p-4 backdrop-blur-md sm:p-5 ${className ?? ""}`}
      style={{ borderColor: `color-mix(in srgb, ${theme.accent} 25%, rgba(255,255,255,0.10))` }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.18em]"
            style={{ color: theme.text }}
          >
            {t("explain.kicker")}
          </p>
          <h3 className="font-display mt-1 text-base font-semibold tracking-tight text-white">
            {t("explain.title")}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-white/65">{explanation.headline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NarrateButton text={narration} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10"
          >
            {open ? t("explain.collapse") : t("explain.expand")}
          </button>
        </div>
      </header>

      {open ? (
        <>
          {/* Top facts row */}
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FactCell
              label={t("explain.fact.tonality")}
              value={explanation.planet_signature.tonality}
              theme={theme}
            />
            <FactCell
              label={t("explain.fact.rhythm")}
              value={explanation.planet_signature.rhythm}
              theme={theme}
            />
            <FactCell
              label={t("explain.fact.bpm")}
              value={explanation.style_influence.bpm ? `${explanation.style_influence.bpm}` : "—"}
              theme={theme}
            />
            <FactCell
              label={t("explain.fact.points")}
              value={`${explanation.data_source.points_count}`}
              theme={theme}
            />
          </dl>

          {/* Why this planet */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">
              {t("explain.whyTitle", { planet: planetName })}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              {explanation.planet_signature.why}
            </p>
          </div>

          {/* Data source */}
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-3">
            <DataChip
              label={t("explain.data.window")}
              value={`${explanation.data_source.time_window_days} ${t("explain.data.days")}`}
            />
            <DataChip
              label={t("explain.data.speed")}
              value={`${formatValue(explanation.data_source.speed_range_km_s)} km/s`}
            />
            <DataChip
              label={t("explain.data.distance")}
              value={`${formatValue(explanation.data_source.distance_range_au)} AU`}
            />
          </div>

          {/* Rules */}
          <ul className="mt-4 space-y-2">
            {explanation.rules.map((r) => {
              const expanded = openRule === r.id;
              return (
                <li key={r.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenRule((cur) => (cur === r.id ? null : r.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenRule((cur) => (cur === r.id ? null : r.id));
                      }
                    }}
                    aria-expanded={expanded}
                    className="w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-white">
                        {RULE_GLOSSARY[r.id] ? (
                          <GlossaryTerm id={RULE_GLOSSARY[r.id]}>{r.title}</GlossaryTerm>
                        ) : (
                          r.title
                        )}
                      </p>
                      <span className="text-[10px] text-white/35">
                        {expanded ? t("explain.collapse") : t("explain.expand")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/65">{r.summary}</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Mapping label={r.input_label} value={formatValue(r.input_value)} dim />
                      <Mapping label={r.output_label} value={formatValue(r.output_value)} theme={theme} />
                    </div>
                    {expanded ? (
                      <p className="mt-3 text-xs leading-relaxed text-white/75 border-t border-white/10 pt-3">
                        {r.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function FactCell({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof getPlanetTheme> }) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: `color-mix(in srgb, ${theme.accent} 25%, transparent)`,
        background: theme.accentSoft,
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/55">{label}</p>
      <p className="text-sm font-semibold" style={{ color: theme.text }}>
        {value}
      </p>
    </div>
  );
}

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-xs text-white/85">{value}</p>
    </div>
  );
}

function Mapping({
  label,
  value,
  dim = false,
  theme,
}: {
  label: string;
  value: string;
  dim?: boolean;
  theme?: ReturnType<typeof getPlanetTheme>;
}) {
  return (
    <div
      className="rounded-lg border px-2.5 py-1.5"
      style={
        theme
          ? {
              borderColor: `color-mix(in srgb, ${theme.accent} 35%, transparent)`,
              background: theme.accentSoft,
            }
          : {
              borderColor: "rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.30)",
            }
      }
    >
      <p className={`text-[10px] font-medium uppercase tracking-wider ${dim ? "text-white/45" : "text-white/55"}`}>
        {label}
      </p>
      <p
        className="font-mono text-[11px]"
        style={theme ? { color: theme.text } : { color: "rgba(255,255,255,0.85)" }}
      >
        {value}
      </p>
    </div>
  );
}
