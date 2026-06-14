import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  type EncyclopediaCatalog,
  type PlanetFacts,
  fetchEncyclopedia,
} from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";
import { PLANETS } from "@/lib/api";

/**
 * Encyclopedia hub: an at-a-glance card for each of the 8 planets, ordered
 * by mean distance from the Sun (innermost first), with quick stats and a
 * deep-link to the studio for instant sonification.
 */

function formatPeriod(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)} h`;
  if (days < 1000) return `${days.toFixed(1)} d`;
  if (days < 100_000) return `${(days / 365.25).toFixed(1)} y`;
  return `${(days / 365.25).toFixed(0)} y`;
}

function formatRotation(hours: number): string {
  const v = Math.abs(hours);
  const retro = hours < 0 ? " ↺" : "";
  if (v < 48) return `${v.toFixed(1)} h${retro}`;
  return `${(v / 24).toFixed(1)} d${retro}`;
}

export function EncyclopediaPage() {
  const { t, i18n } = useTranslation();
  const [catalog, setCatalog] = useState<EncyclopediaCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchEncyclopedia()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!catalog) return [] as PlanetFacts[];
    const q = query.trim().toLowerCase();
    if (!q) return catalog.planets;
    return catalog.planets.filter((p) => {
      const hay = [
        p.name,
        p.name_tr ?? "",
        p.name_ar ?? "",
        p.tagline,
        p.tagline_tr ?? "",
        (p.fun_facts ?? []).join(" "),
        (p.missions ?? []).map((m) => `${m.name} ${m.agency}`).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, query]);

  const lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const isTr = lang.startsWith("tr");

  return (
    <>
      <section className="mb-8">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("encyclopedia.heroKicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("encyclopedia.heroTitle")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("encyclopedia.heroSubtitle")}
        </p>
      </section>

      <section className="mb-6">
        <label htmlFor="enc-search" className="sr-only">
          {t("encyclopedia.search")}
        </label>
        <input
          id="enc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("encyclopedia.searchPlaceholder")}
          className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
        />
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : !catalog ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/45">
          {t("encyclopedia.noMatch")}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const theme = getPlanetTheme(p.name as (typeof PLANETS)[number]);
            const localName = isTr && p.name_tr ? p.name_tr : p.name;
            const tagline = isTr && p.tagline_tr ? p.tagline_tr : p.tagline;
            return (
              <li key={p.name}>
                <Link
                  to={`/encyclopedia/${p.name.toLowerCase()}`}
                  className="group relative block overflow-hidden rounded-2xl border bg-white/[0.04] p-5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/[0.07]"
                  style={{
                    borderColor: `color-mix(in srgb, ${theme.accent} 35%, transparent)`,
                    // Themed shadow only on hover, so the card looks calm at rest
                    // but visibly "lifts" toward the viewer when targeted. CSS
                    // custom properties let us reuse the planet glow value
                    // without re-running the color-mix at hover time.
                    ["--card-hover-shadow" as string]: `0 24px 48px -24px ${theme.glow}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "var(--card-hover-shadow)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "";
                  }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl transition group-hover:blur-3xl"
                    style={{ background: theme.glow }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
                        {p.symbol} · {p.name}
                      </p>
                      <h2
                        className="font-display mt-1 text-xl font-semibold tracking-tight"
                        style={{ color: theme.text }}
                      >
                        {localName}
                      </h2>
                    </div>
                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: theme.accentSoft,
                        color: theme.text,
                      }}
                    >
                      {p.physics.mean_distance_au.toFixed(2)} AU
                    </span>
                  </div>

                  <p className="relative mt-3 line-clamp-2 text-xs leading-relaxed text-white/65">
                    {tagline}
                  </p>

                  <dl className="relative mt-4 grid grid-cols-3 gap-2 text-[10px] text-white/55">
                    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                      <dt className="opacity-70">{t("encyclopedia.field.period")}</dt>
                      <dd className="font-mono text-white/80">{formatPeriod(p.physics.orbital_period_days)}</dd>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                      <dt className="opacity-70">{t("encyclopedia.field.day")}</dt>
                      <dd className="font-mono text-white/80">{formatRotation(p.physics.rotation_period_hours)}</dd>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                      <dt className="opacity-70">{t("encyclopedia.field.moons")}</dt>
                      <dd className="font-mono text-white/80">
                        {p.physics.moons}
                        {p.physics.rings ? " · ⊕" : ""}
                      </dd>
                    </div>
                  </dl>

                  <p className="relative mt-3 text-[10px] uppercase tracking-wider text-white/40">
                    {t("encyclopedia.openDetail")} →
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
