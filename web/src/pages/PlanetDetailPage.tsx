import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { NarrateButton } from "@/components/ui/NarrateButton";
import { tabClasses } from "@/components/ui/Tabs";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import {
  PLANETS,
  type PlanetFacts,
  fetchPlanetFacts,
} from "@/lib/api";
import { exportPlanetPdf } from "@/lib/pdfExport";
import { getPlanetTheme, planetCssVars } from "@/lib/planetTheme";

/**
 * Detailed planet reference: physics, history, missions, sound signature.
 *
 * The page is split into tabs so quick lookups (e.g. "How many moons?") stay
 * within the fold while deep dives (sound signature, missions) are still
 * one click away.
 */

type Tab = "overview" | "physics" | "missions" | "sound" | "facts" | "gallery";

const TABS: Tab[] = ["overview", "physics", "missions", "sound", "facts", "gallery"];

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(digits)}×10⁹`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(digits)}×10⁶`;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtMass(kg: number): string {
  const earthMass = 5.972e24;
  return `${(kg / earthMass).toFixed(3)} M⊕`;
}

function PhysicsRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-2 sm:flex-row sm:items-baseline sm:justify-between">
      <div>
        <p className="text-sm text-white/85">{label}</p>
        {hint ? <p className="text-[10px] text-white/40">{hint}</p> : null}
      </div>
      <p className="font-mono text-sm text-white sm:text-right">{value}</p>
    </div>
  );
}

export function PlanetDetailPage() {
  const { name = "" } = useParams<{ name: string }>();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<PlanetFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const track = useAchievementTracker();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchPlanetFacts(name)
      .then((p) => {
        if (!cancelled) {
          setData(p);
          track("planet:visited", { planet: p.name });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [name, track]);

  const theme = useMemo(() => {
    const canonical = PLANETS.find((p) => p.toLowerCase() === name.toLowerCase());
    return getPlanetTheme((canonical ?? (data?.name as (typeof PLANETS)[number])) ?? "Mars");
  }, [data, name]);

  const lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const isTr = lang.startsWith("tr");

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />;
  }

  const localName = isTr && data.name_tr ? data.name_tr : data.name;
  const tagline = isTr && data.tagline_tr ? data.tagline_tr : data.tagline;
  const localFunFacts = isTr && data.fun_facts_tr?.length ? data.fun_facts_tr : data.fun_facts;
  const studioLink = `/studio?planet=${data.name}`;

  return (
    <div style={planetCssVars(theme)}>
      <nav className="mb-4 flex items-center gap-2 text-[11px] text-white/45">
        <Link to="/encyclopedia" className="hover:text-white/80">
          {t("encyclopedia.crumbHome")}
        </Link>
        <span>/</span>
        <span className="text-white/85">{data.name}</span>
      </nav>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl border p-6 sm:p-8"
        style={{
          borderColor: `color-mix(in srgb, ${theme.accent} 30%, transparent)`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${theme.accent} 18%, transparent) 0%, rgba(255,255,255,0.02) 60%)`,
        }}
      >
        {data.imagery?.hero ? (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-30"
            style={{
              backgroundImage: `radial-gradient(circle at 80% 30%, transparent 0%, rgba(0,0,0,0.8) 70%), url(${data.imagery.hero.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: theme.glow }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">
              {data.symbol} · {t("encyclopedia.kicker")}
            </p>
            <h1
              className="font-display mt-1.5 font-bold text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.04em]"
              style={{ color: theme.text }}
            >
              {localName}
            </h1>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/80 sm:text-base">
              {tagline}
            </p>
            <div className="mt-3">
              <NarrateButton
                text={`${localName}. ${tagline ?? ""} ${data.atmosphere.summary} ${data.sound_signature.why}`}
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Link
              to={studioLink}
              className="font-display inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/25 transition hover:brightness-110"
            >
              ♪ {t("encyclopedia.listenCta")}
            </Link>
            <button
              type="button"
              onClick={() => exportPlanetPdf(data, { isTr })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/[0.1]"
              title={t("encyclopedia.exportPdfHint") ?? ""}
            >
              ⇩ {t("encyclopedia.exportPdf")}
            </button>
          </div>
        </div>

        {/* Quick stats row */}
        <dl className="relative mt-6 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 sm:gap-3">
          <QuickStat
            label={t("encyclopedia.field.distance")}
            value={`${data.physics.mean_distance_au.toFixed(2)} AU`}
          />
          <QuickStat
            label={t("encyclopedia.field.year")}
            value={`${(data.physics.orbital_period_days / 365.25).toFixed(2)} yr`}
          />
          <QuickStat
            label={t("encyclopedia.field.gravity")}
            value={`${data.physics.gravity_g.toFixed(2)} g`}
          />
          <QuickStat
            label={t("encyclopedia.field.moons")}
            value={`${data.physics.moons}${data.physics.rings ? " · ⊕" : ""}`}
          />
        </dl>
      </section>

      {/* Tabs — sticky on tablet+ so the user can switch sections while
          deep-scrolled. On mobile we leave them inline (the page is shorter
          and the EncyclopediaLayout already shows two stacked nav rows). */}
      <nav
        className="my-6 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/55 p-1 backdrop-blur-md sm:sticky sm:top-[64px] sm:z-30 sm:my-6 sm:shadow-lg sm:shadow-black/30"
        aria-label={t("encyclopedia.tabsAria")}
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={tabClasses(tab === id, "sm")}
          >
            {t(`encyclopedia.tab.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={t("encyclopedia.section.discovery")}>
            <p className="text-sm leading-relaxed text-white/80">
              <b className="text-white">{data.discovery_year_text}</b>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/65">{data.discovered_by}</p>
            <p className="mt-3 text-xs italic text-white/45">{data.named_after}</p>
          </Card>
          <Card title={t("encyclopedia.section.atmosphere")}>
            <p className="text-sm leading-relaxed text-white/80">{data.atmosphere.summary}</p>
            <p className="mt-3 text-[11px] text-white/45">
              {t("encyclopedia.field.surfacePressure")}:{" "}
              <span className="font-mono text-white/75">
                {data.atmosphere.pressure_atm < 0.001
                  ? `${data.atmosphere.pressure_atm.toExponential(1)} atm`
                  : `${data.atmosphere.pressure_atm.toFixed(3)} atm`}
              </span>
            </p>
          </Card>
        </section>
      )}

      {tab === "physics" && (
        <Card title={t("encyclopedia.section.physics")}>
          <PhysicsRow
            label={t("encyclopedia.field.distance")}
            hint={t("encyclopedia.field.distanceHint")}
            value={`${data.physics.mean_distance_au.toFixed(3)} AU`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.period")}
            hint={t("encyclopedia.field.periodHint")}
            value={`${data.physics.orbital_period_days.toFixed(1)} d (${(data.physics.orbital_period_days / 365.25).toFixed(2)} yr)`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.rotation")}
            hint={t("encyclopedia.field.rotationHint")}
            value={`${data.physics.rotation_period_hours.toFixed(2)} h${data.physics.rotation_period_hours < 0 ? " ↺" : ""}`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.tilt")}
            hint={t("encyclopedia.field.tiltHint")}
            value={`${data.physics.axial_tilt_deg.toFixed(2)}°`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.eccentricity")}
            hint={t("encyclopedia.field.eccentricityHint")}
            value={data.physics.eccentricity.toFixed(4)}
          />
          <PhysicsRow
            label={t("encyclopedia.field.radius")}
            value={`${fmtNum(data.physics.mean_radius_km, 0)} km`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.mass")}
            value={fmtMass(data.physics.mass_kg)}
          />
          <PhysicsRow
            label={t("encyclopedia.field.gravity")}
            value={`${data.physics.gravity_g.toFixed(3)} g`}
          />
          <PhysicsRow
            label={t("encyclopedia.field.temperature")}
            value={
              data.physics.surface_temp_c.min === data.physics.surface_temp_c.max
                ? `${data.physics.surface_temp_c.min} °C`
                : `${data.physics.surface_temp_c.min} → ${data.physics.surface_temp_c.max} °C`
            }
          />
          <PhysicsRow
            label={t("encyclopedia.field.moons")}
            value={`${data.physics.moons}${data.physics.rings ? ` · ${t("encyclopedia.field.rings")}` : ""}`}
          />
        </Card>
      )}

      {tab === "missions" && (
        <Card title={t("encyclopedia.section.missions")}>
          {data.missions.length === 0 ? (
            <p className="text-sm text-white/45">{t("encyclopedia.noMissions")}</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.missions.map((m) => (
                <li key={m.name + m.year} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-white">{m.name}</p>
                    <span className="font-mono text-[11px] text-white/55">
                      {m.year} · {m.agency}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/45">{m.type}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{m.result}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "sound" && (
        <Card title={t("encyclopedia.section.sound")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Pill label={t("encyclopedia.sound.tonality")} value={data.sound_signature.tonality} theme={theme} />
            <Pill label={t("encyclopedia.sound.rhythm")} value={data.sound_signature.rhythm} theme={theme} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/85">{data.sound_signature.why}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to={studioLink}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              ♪ {t("encyclopedia.sound.tryAi")}
            </Link>
            <Link
              to={`/studio/demo?planet=${data.name}`}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/30 hover:bg-white/5"
            >
              {t("encyclopedia.sound.demo")}
            </Link>
          </div>
        </Card>
      )}

      {tab === "facts" && (
        <Card title={t("encyclopedia.section.facts")}>
          <ul className="space-y-3">
            {localFunFacts.map((f, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-white/85">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: theme.accent }}
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "gallery" && (
        <Card title={t("encyclopedia.section.gallery")}>
          {data.imagery?.gallery && data.imagery.gallery.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[data.imagery.hero, ...data.imagery.gallery].map((img, i) => (
                <figure key={img.url + i} className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <a
                    href={img.source_url || img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={img.caption}
                  >
                    <img
                      src={img.url}
                      alt={img.caption}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition hover:opacity-90"
                    />
                  </a>
                  <figcaption className="px-3 py-2 text-[11px] leading-relaxed text-white/65">
                    {img.caption}
                    <span className="block text-[10px] text-white/35">{img.credit}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/45">{t("encyclopedia.noImagery")}</p>
          )}
        </Card>
      )}

      {/* Citations always visible at bottom */}
      <section className="mt-6">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/45">
          {t("encyclopedia.section.citations")}
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.citations.map((c) => (
            <li key={c.url}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-[11px] text-white/75 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100"
              >
                {c.label} <span aria-hidden>↗</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
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

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-sm text-white">{value}</p>
    </div>
  );
}

function Pill({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof getPlanetTheme> }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${theme.accent} 30%, transparent)`,
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
