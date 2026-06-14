import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { type HistoricMission, fetchHistoricMissions, PLANETS } from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";

/**
 * Historic Missions Theatre.
 *
 * A vertical timeline (left-to-right on wide screens) of milestone space
 * missions. Filterable by category and primary target. Each card surfaces
 * a one-line summary, the mission's lasting impact, and quick links to
 * NASA's authoritative source + (when applicable) the planet's
 * encyclopedia entry - so the page reads like a museum placard rather
 * than a Wikipedia stub.
 */

type CategoryFilter = "all" | NonNullable<HistoricMission["category"]>;
const CATEGORIES: CategoryFilter[] = ["all", "first", "lunar", "planetary", "deep-space", "telescope", "station"];

const CATEGORY_LABELS: Record<CategoryFilter, { en: string; tr: string }> = {
  all: { en: "All", tr: "Tümü" },
  first: { en: "Firsts", tr: "İlkler" },
  lunar: { en: "Lunar", tr: "Ay" },
  planetary: { en: "Planetary", tr: "Gezegen" },
  "deep-space": { en: "Deep space", tr: "Derin uzay" },
  telescope: { en: "Telescopes", tr: "Teleskoplar" },
  station: { en: "Stations", tr: "İstasyonlar" },
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function HistoricMissionsPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
  const isTr = lang.startsWith("tr");

  const [missions, setMissions] = useState<HistoricMission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const track = useAchievementTracker();
  useEffect(() => {
    track("missions:visited");
  }, [track]);

  useEffect(() => {
    let cancelled = false;
    fetchHistoricMissions()
      .then((m) => {
        if (!cancelled) {
          // Sort by launch date ascending - chronological reads better in a timeline.
          const sorted = [...m].sort((a, b) => a.launchDate.localeCompare(b.launchDate));
          setMissions(sorted);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!missions) return [] as HistoricMission[];
    const q = query.trim().toLowerCase();
    return missions.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (!q) return true;
      const hay = [
        m.mission,
        m.agency,
        m.target,
        m.status,
        m.summary ?? "",
        m.impact ?? "",
        m.vehicle ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [cat, missions, query]);

  return (
    <>
      <header className="mb-6">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("missions.kicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("missions.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("missions.subtitle")}
        </p>
      </header>

      <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("missions.searchPlaceholder")}
          className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
        />
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                cat === c
                  ? "bg-gradient-to-r from-violet-600/45 to-cyan-600/35 text-white ring-1 ring-white/20"
                  : "text-white/55 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              {isTr ? CATEGORY_LABELS[c].tr : CATEGORY_LABELS[c].en}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : !missions ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/45">
          {t("missions.noMatch")}
        </div>
      ) : (
        <ol className="relative space-y-4 border-l border-white/10 pl-5 sm:pl-8">
          {filtered.map((m) => (
            <MissionCard key={m.id} mission={m} locale={lang} />
          ))}
        </ol>
      )}
    </>
  );
}

function MissionCard({ mission: m, locale }: { mission: HistoricMission; locale: string }) {
  const { t } = useTranslation();
  const isPlanetTarget = m.primary_target && (PLANETS as readonly string[]).includes(m.primary_target);
  const theme = isPlanetTarget
    ? getPlanetTheme(m.primary_target as (typeof PLANETS)[number])
    : null;

  return (
    <li className="relative">
      {/* Timeline dot */}
      <span
        aria-hidden
        className="absolute -left-[27px] top-5 h-3 w-3 rounded-full ring-4 ring-black/65 sm:-left-[33px]"
        style={{ background: theme?.accent ?? "rgba(34, 211, 238, 0.85)" }}
      />
      <article
        className="rounded-2xl border bg-white/[0.04] p-5 backdrop-blur-md transition hover:bg-white/[0.06]"
        style={{
          borderColor: theme
            ? `color-mix(in srgb, ${theme.accent} 28%, rgba(255,255,255,0.10))`
            : "rgba(255,255,255,0.10)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">
              {m.category ? m.category.replace("-", " ") : ""}
            </p>
            <h2
              className="font-display text-lg font-semibold tracking-tight"
              style={{ color: theme?.text ?? "white" }}
            >
              {m.mission}
            </h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[11px] text-white/85">{formatDate(m.launchDate, locale)}</p>
            {m.endDate ? (
              <p className="font-mono text-[10px] text-white/45">→ {formatDate(m.endDate, locale)}</p>
            ) : null}
          </div>
        </header>

        <p className="mt-1 text-[11px] text-white/55">
          {m.agency}
          {m.vehicle ? ` · ${m.vehicle}` : ""} · {m.target}
        </p>

        {m.summary ? <p className="mt-3 text-sm leading-relaxed text-white/85">{m.summary}</p> : null}

        {m.impact ? (
          <p className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3 text-xs leading-relaxed text-cyan-100">
            <span className="font-semibold text-cyan-200">{t("missions.impactLabel")}: </span>
            {m.impact}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-white/45">
          <span className="opacity-70">{t("missions.statusLabel")}: </span>
          <span className="text-white/80">{m.status}</span>
        </p>

        <footer className="mt-3 flex flex-wrap gap-2">
          <a
            href={m.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-[11px] text-white/75 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100"
          >
            {t("missions.source")} <span aria-hidden>↗</span>
          </a>
          {isPlanetTarget ? (
            <Link
              to={`/encyclopedia/${(m.primary_target as string).toLowerCase()}`}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition hover:brightness-110"
              style={{
                borderColor: `color-mix(in srgb, ${theme?.accent ?? "#22d3ee"} 35%, transparent)`,
                background: theme?.accentSoft,
                color: theme?.text,
              }}
            >
              ♪ {t("missions.openPlanet", { planet: m.primary_target })}
            </Link>
          ) : null}
          {m.id === "artemis_i" ? (
            <Link
              to="/studio?planet=Earth"
              className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/[0.08] px-3 py-1 text-[11px] text-violet-100 transition hover:border-violet-400/55 hover:bg-violet-500/15"
            >
              {t("missions.openArtemis")} →
            </Link>
          ) : null}
        </footer>
      </article>
    </li>
  );
}
