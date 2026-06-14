import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Starfield } from "@/components/Starfield";
import { AchievementsPanel } from "@/components/ui/AchievementsPanel";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { CinematicIntro } from "@/components/welcome/CinematicIntro";
import { DailyPulse } from "@/components/welcome/DailyPulse";
import { DailyTrivia } from "@/components/welcome/DailyTrivia";
import { totalUnlocked } from "@/lib/achievements";
import { PLANETS } from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";

export function WelcomePage() {
  const { t } = useTranslation();
  // Suppress the AchievementsPanel for first-time visitors: an empty grid of
  // greyed-out badges reads as "broken feature", not "progression to chase".
  // We reveal it lazily once the user has unlocked at least one badge.
  const [hasUnlocked, setHasUnlocked] = useState(() => totalUnlocked().unlocked > 0);
  useEffect(() => {
    if (hasUnlocked) return undefined;
    const interval = window.setInterval(() => {
      if (totalUnlocked().unlocked > 0) {
        setHasUnlocked(true);
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [hasUnlocked]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <CinematicIntro />
      <Starfield variant="welcome" />

      <header className="welcome-header-enter relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link to="/" className="flex items-center gap-3 transition hover:opacity-90" aria-label={t("app.name")}>
          <img
            src="/logo-mark.svg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 drop-shadow-[0_0_18px_rgba(124,58,237,0.45)]"
            draggable={false}
          />
          <div>
            <p className="font-display text-sm font-semibold tracking-wide text-white">
              {t("app.name")}
            </p>
            <p className="max-w-[200px] text-xs text-white/45 md:max-w-none">{t("app.tagline")}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <LanguageSwitch />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-4 md:px-10">
        <div className="welcome-burst-ring" />
        <div className="welcome-burst-ring welcome-burst-ring--late" />

        <div className="welcome-orb-glow pointer-events-none absolute h-[min(90vw,520px)] w-[min(90vw,520px)] rounded-full bg-gradient-to-br from-violet-600/25 via-cyan-500/10 to-transparent blur-3xl" />

        <div className="relative w-full max-w-2xl text-center">
          <span className="hero-enter hero-enter--badge mb-6 inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-violet-200/90">
            {t("welcome.badge")}
          </span>

          <h1 className="hero-enter hero-enter--title font-display font-bold text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.05] tracking-[-0.04em]">
            <span className="welcome-headline-gradient welcome-headline-glow">
              {t("welcome.headline")}
            </span>
          </h1>

          <p className="hero-enter hero-enter--sub mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/65 md:text-lg">
            {t("welcome.sub")}
          </p>

          {/* Primary CTA gets its own row at a hero scale; the two ghosts sit
              under it as a quiet "or do this instead" pair so the eye lands on
              "Enter studio" first, every time. */}
          <div className="mt-10 flex flex-col items-center gap-4">
            <Link
              to="/studio"
              className="hero-cta-motion group relative inline-flex items-center justify-center overflow-hidden rounded-2xl px-12 py-5 text-base font-semibold text-white shadow-2xl shadow-violet-600/30 ring-1 ring-white/10 transition hover:scale-[1.02] hover:shadow-cyan-500/20 active:scale-[0.98] sm:text-lg"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 opacity-95" />
              <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/30 to-transparent transition duration-700 ease-out group-hover:translate-x-[120%]" />
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-white/20 to-violet-400/0 opacity-0 transition group-hover:opacity-100" />
              <span className="relative font-display tracking-tight">{t("welcome.ctaEnter")}</span>
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-1 text-sm text-white/55">
              <Link
                to="/studio/demo"
                className="rounded-lg px-4 py-2 font-medium transition hover:bg-white/[0.05] hover:text-white"
              >
                {t("welcome.ctaDemo")}
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <Link
                to="/encyclopedia"
                className="rounded-lg px-4 py-2 font-medium transition hover:bg-white/[0.05] hover:text-white"
              >
                {t("welcome.ctaEncyclopedia")}
              </Link>
              <span aria-hidden className="text-white/20">·</span>
              <Link
                to="/birthday"
                className="rounded-lg px-4 py-2 font-medium transition hover:bg-white/[0.05] hover:text-white"
              >
                {t("welcome.ctaBirthday")}
              </Link>
            </div>
          </div>

          <p className="hero-enter hero-enter--hint mt-6 text-sm text-white/40">{t("welcome.ctaSkipHint")}</p>
        </div>

        <section className="relative mx-auto mt-14 w-full max-w-4xl space-y-6">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">
            {t("welcome.planetsTitle")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PLANETS.map((p) => {
              const theme = getPlanetTheme(p);
              return (
                <Link
                  key={p}
                  to={`/studio?planet=${encodeURIComponent(p)}`}
                  className="group flex min-h-[40px] items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition hover:scale-[1.04]"
                  style={{
                    borderColor: `color-mix(in srgb, ${theme.accent} 38%, transparent)`,
                    background: theme.accentSoft,
                    color: theme.text,
                  }}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full shadow-sm transition group-hover:scale-125"
                    style={{
                      background: theme.accent,
                      boxShadow: `0 0 12px ${theme.glow}`,
                    }}
                  />
                  {p}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
          <DailyPulse />
          <DailyTrivia />
        </section>

        {hasUnlocked ? (
          <section className="mx-auto mt-6 w-full max-w-5xl">
            <AchievementsPanel />
          </section>
        ) : null}
      </main>

      <footer className="welcome-footer-enter relative z-10 border-t border-white/5 px-6 py-4 text-center text-xs text-white/35 md:px-10">
        {t("welcome.footerApi")}
      </footer>
    </div>
  );
}
