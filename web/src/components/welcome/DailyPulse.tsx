import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { type PlanetFacts, PLANETS, fetchPlanetFacts } from "@/lib/api";
import { getPlanetTheme, planetCssVars } from "@/lib/planetTheme";

/**
 * "Daily NASA Pulse" — a planet-of-the-day card on the Welcome page.
 *
 * Picks one of the 8 planets deterministically by UTC day, fetches its
 * physics + a single fun fact from the encyclopedia, and offers two
 * one-click CTAs: listen (Studio) and explore (encyclopedia entry).
 *
 * Skeleton renders immediately so the page doesn't shift; network errors
 * silently fall back to no card.
 */

function dayIndex(now: Date = new Date()): number {
  const epoch = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(epoch / (1000 * 60 * 60 * 24));
}

export function DailyPulse({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
  const isTr = lang.startsWith("tr");

  const planet = useMemo(() => PLANETS[dayIndex() % PLANETS.length], []);
  const [data, setData] = useState<PlanetFacts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchPlanetFacts(planet)
      .then((p) => {
        if (!cancelled) setData(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [planet]);

  const theme = useMemo(() => getPlanetTheme(planet), [planet]);
  const cssVars = useMemo(() => planetCssVars(theme), [theme]);

  if (error) return null; // Silent failure — the rest of the page is still useful.

  // Pick a fun fact deterministically from the day index so it varies per day.
  const facts = (isTr && data?.fun_facts_tr?.length ? data.fun_facts_tr : data?.fun_facts) ?? [];
  const fact = facts.length > 0 ? facts[dayIndex() % facts.length] : undefined;
  const localName = isTr && data?.name_tr ? data.name_tr : data?.name ?? planet;
  const tagline = isTr && data?.tagline_tr ? data.tagline_tr : data?.tagline;

  return (
    <section
      style={cssVars}
      className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-md sm:p-6 ${className ?? ""}`}
    >
      {/* Themed glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-50 blur-3xl"
        style={{ background: `radial-gradient(circle, ${theme.accent}, transparent 70%)` }}
      />
      <div
        className="absolute inset-0 -z-10 rounded-2xl"
        style={{
          borderColor: `color-mix(in srgb, ${theme.accent} 30%, transparent)`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${theme.accent} 10%, transparent), transparent 60%)`,
        }}
      />

      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>
          {t("pulse.title")}
        </h3>
        <span className="font-mono text-[11px] text-white/45">
          {new Date().toLocaleDateString(lang, { year: "numeric", month: "short", day: "2-digit" })}
        </span>
      </header>

      {!data ? (
        <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span aria-hidden className="text-3xl" style={{ color: theme.accent }}>
              {data.symbol}
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-white">{localName}</p>
              {tagline ? <p className="text-xs italic text-white/55">{tagline}</p> : null}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center text-[11px]">
            <div>
              <dt className="text-white/45">{t("pulse.distance")}</dt>
              <dd className="font-mono text-sm text-white">{data.physics.mean_distance_au.toFixed(2)} AU</dd>
            </div>
            <div>
              <dt className="text-white/45">{t("pulse.period")}</dt>
              <dd className="font-mono text-sm text-white">{data.physics.orbital_period_days.toFixed(1)} d</dd>
            </div>
            <div>
              <dt className="text-white/45">{t("pulse.moons")}</dt>
              <dd className="font-mono text-sm text-white">{data.physics.moons}</dd>
            </div>
          </dl>

          {fact ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-relaxed text-white/80">
              <span className="mr-2 font-semibold text-white">{t("pulse.didYouKnow")}</span>
              {fact}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              to={`/studio?planet=${encodeURIComponent(planet)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:scale-[1.02]"
              style={{
                borderColor: `color-mix(in srgb, ${theme.accent} 50%, transparent)`,
                background: theme.accentSoft,
                color: theme.text,
              }}
            >
              ♪ {t("pulse.listen")}
            </Link>
            <Link
              to={`/encyclopedia/${encodeURIComponent(planet)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/[0.1]"
            >
              {t("pulse.explore")} →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
