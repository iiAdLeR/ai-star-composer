import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "@/components/ui/Toast";
import { getApiBase } from "@/lib/apiBase";
import {
  type BirthdayGiftResponse,
  resolveGiftArtifactUrl,
} from "@/lib/api";
import { getPlanetTheme, planetCssVars } from "@/lib/planetTheme";

interface CosmicCardProps {
  gift: BirthdayGiftResponse;
  /** When true, the audio player tries to autoplay on mount. Used on
   * `/gift/<token>` so the recipient hears the song immediately. */
  autoplay?: boolean;
  /** When true, render a compact mode (single column). */
  compact?: boolean;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined).format(Math.round(n));
}

function formatBirthDate(iso: string, locale: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return iso;
  }
}

export function CosmicCard({ gift, autoplay = false, compact = false }: CosmicCardProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const apiBase = getApiBase();
  const theme = getPlanetTheme(gift.planet);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // The HQ render (FluidSynth + SoundFont) is much nicer when available, so
  // we prefer it over the synth fallback. `hybrid_wav` (with NASA ambient
  // background) is currently never produced by the gift pipeline but we
  // keep it in the priority list for parity with /generate.
  const audioUrl = useMemo(() => {
    const candidates = [
      gift.artifacts.melody_hq_wav,
      gift.artifacts.hybrid_wav,
      gift.artifacts.melody_wav,
    ];
    for (const c of candidates) {
      const resolved = resolveGiftArtifactUrl(apiBase, c ?? null);
      if (resolved) return resolved;
    }
    return null;
  }, [apiBase, gift.artifacts]);

  const midiUrl = useMemo(
    () => resolveGiftArtifactUrl(apiBase, gift.artifacts.midi ?? null),
    [apiBase, gift.artifacts.midi],
  );

  useEffect(() => {
    if (!autoplay || !audioRef.current || !audioUrl) return undefined;
    // Modern browsers block autoplay unless the user has interacted with
    // the page. We try once and silently swallow the rejection - the
    // visible play button will work on click.
    const el = audioRef.current;
    el.play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        /* user gesture needed */
      });
    return () => {
      el.pause();
    };
  }, [autoplay, audioUrl]);

  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("tr") ? "tr-TR" : "en-US";

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return gift.share_path;
    return `${window.location.origin}${gift.share_path}`;
  }, [gift.share_path]);

  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.push(t("birthday.toasts.shareCopied"), { variant: "success" });
    } catch {
      toast.push(t("birthday.toasts.shareFailed"), { variant: "warning" });
    }
  };

  const { cosmic_facts: facts } = gift;
  const planetTransKey = `birthday.planetNames.${gift.planet}`;
  const planetLabel = t(planetTransKey, gift.planet);

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border bg-white/[0.03] p-6 shadow-2xl backdrop-blur-md md:p-8 ${
        compact ? "" : "md:rounded-[2rem] md:p-10"
      }`}
      style={{
        ...planetCssVars(theme),
        borderColor: `color-mix(in srgb, ${theme.accent} 35%, transparent)`,
        boxShadow: `0 30px 80px -40px ${theme.glow}, 0 0 0 1px color-mix(in srgb, ${theme.accent} 20%, transparent)`,
        color: theme.text,
      }}
    >
      {/* Decorative orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${theme.glow}, transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full opacity-60 blur-3xl"
        style={{ background: `radial-gradient(circle, ${theme.accentSoft}, transparent 70%)` }}
      />

      <header className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.32em] opacity-80"
            style={{ color: theme.accent }}
          >
            {t("birthday.card.kicker")}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight md:text-4xl">
            {t("birthday.card.title", {
              name: gift.recipient_name,
              planet: planetLabel,
            })}
          </h2>
          <p className="mt-2 max-w-xl text-sm opacity-80">
            {t("birthday.card.subtitle", {
              date: formatBirthDate(gift.birth_date, locale),
              planet: planetLabel,
            })}
          </p>
        </div>
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border text-3xl font-bold"
          style={{
            borderColor: `color-mix(in srgb, ${theme.accent} 60%, transparent)`,
            background: theme.accentSoft,
            color: theme.accent,
            boxShadow: `inset 0 0 24px ${theme.glow}`,
          }}
          aria-hidden
        >
          ★
        </div>
      </header>

      {gift.message ? (
        <blockquote
          className="relative z-10 mt-6 rounded-2xl border px-4 py-3 text-sm italic opacity-90"
          style={{
            borderColor: `color-mix(in srgb, ${theme.accent} 30%, transparent)`,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          “{gift.message}”
          {gift.sender_name ? (
            <footer className="mt-2 text-xs not-italic opacity-70">
              - {gift.sender_name}
            </footer>
          ) : null}
        </blockquote>
      ) : null}

      {/* Cosmic facts grid */}
      <dl
        className={`relative z-10 mt-6 grid gap-3 ${
          compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"
        }`}
      >
        <Fact
          label={t("birthday.facts.ageInPlanetYears", { planet: planetLabel })}
          value={facts.age_in_planet_years.toLocaleString(locale, {
            maximumFractionDigits: 2,
          })}
          unit={t("birthday.facts.unitYears")}
          accent={theme.accent}
        />
        <Fact
          label={t("birthday.facts.orbitsCompleted")}
          value={formatInt(facts.orbits_completed_since_birth)}
          unit={t("birthday.facts.unitOrbits")}
          accent={theme.accent}
        />
        <Fact
          label={t("birthday.facts.distanceTraveled")}
          value={formatInt(facts.approx_distance_traveled_km / 1_000_000)}
          unit={t("birthday.facts.unitMillionKm")}
          accent={theme.accent}
        />
        <Fact
          label={t("birthday.facts.avgSpeed")}
          value={facts.average_orbital_speed_km_s.toLocaleString(locale, {
            maximumFractionDigits: 1,
          })}
          unit={t("birthday.facts.unitKmS")}
          accent={theme.accent}
        />
      </dl>

      {/* Audio player */}
      <section className="relative z-10 mt-6">
        {audioUrl ? (
          <>
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="auto"
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full"
              style={{ accentColor: theme.accent }}
            >
              <track kind="captions" />
            </audio>
            <p className="mt-2 text-xs opacity-60">
              {t("birthday.card.audioHint", {
                style: t(`birthday.styleCards.${gift.style}.label`, gift.style),
                bpm: gift.bpm ?? " - ",
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {gift.artifacts.melody_hq_wav ? (
                <span
                  className="rounded-full border px-2 py-0.5 font-medium"
                  style={{
                    borderColor: `color-mix(in srgb, ${theme.accent} 50%, transparent)`,
                    background: `color-mix(in srgb, ${theme.accent} 12%, transparent)`,
                    color: theme.accent,
                  }}
                >
                  {t("birthday.card.badgeHq")}
                </span>
              ) : null}
              {gift.lstm_blend?.applied ? (
                <span
                  className="rounded-full border px-2 py-0.5 font-medium opacity-90"
                  style={{
                    borderColor: `color-mix(in srgb, ${theme.accent} 35%, transparent)`,
                    color: theme.text,
                  }}
                >
                  {t("birthday.card.badgeLstm")}
                </span>
              ) : null}
            </div>
            {gift.fluid_render_warning ? (
              <p
                className="mt-2 rounded-lg border px-3 py-2 text-[11px] opacity-80"
                style={{
                  borderColor: "color-mix(in srgb, #f59e0b 50%, transparent)",
                  background: "rgba(245, 158, 11, 0.08)",
                }}
                title={gift.fluid_render_warning}
              >
                {t("birthday.card.fluidFallback")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm opacity-70">{t("birthday.card.audioUnavailable")}</p>
        )}
      </section>

      {/* Action row */}
      <footer className="relative z-10 mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopyShare}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-white/[0.05]"
          style={{
            borderColor: `color-mix(in srgb, ${theme.accent} 50%, transparent)`,
            color: theme.text,
          }}
        >
          {t("birthday.card.shareCopy")}
        </button>
        {audioUrl ? (
          <a
            href={audioUrl}
            download
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-white/[0.05]"
            style={{
              borderColor: `color-mix(in srgb, ${theme.accent} 50%, transparent)`,
              color: theme.text,
            }}
          >
            {t("birthday.card.downloadWav")}
          </a>
        ) : null}
        {midiUrl ? (
          <a
            href={midiUrl}
            download
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-white/[0.05]"
            style={{
              borderColor: `color-mix(in srgb, ${theme.accent} 50%, transparent)`,
              color: theme.text,
            }}
          >
            {t("birthday.card.downloadMidi")}
          </a>
        ) : null}
        <span className="ml-auto text-[11px] opacity-50">
          {t("birthday.card.tokenLabel")}: <code className="font-mono">{gift.token}</code>
        </span>
      </footer>

      {/* Hidden helper to encourage screen readers to mention current playback */}
      <span className="sr-only" aria-live="polite">
        {isPlaying ? t("birthday.card.srPlaying") : t("birthday.card.srPaused")}
      </span>
    </article>
  );
}

function Fact({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 25%, transparent)`,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <dt className="text-[11px] uppercase tracking-[0.16em] opacity-70">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-xl font-semibold tabular-nums" style={{ color: accent }}>
          {value}
        </span>
        <span className="text-xs opacity-65">{unit}</span>
      </dd>
    </div>
  );
}
