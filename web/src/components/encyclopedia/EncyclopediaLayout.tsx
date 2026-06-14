import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { navLinkTabClass } from "@/components/ui/Tabs";

const subTab = (state: { isActive: boolean }) => navLinkTabClass(state, "sm");

/**
 * Layout for educational reference pages.
 *
 * Differs from StudioLayout: no 3D viewport (content-first), full-width
 * scroll container so tables and long-form copy can breathe.
 */
export function EncyclopediaLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <div className="min-h-dvh w-full bg-gradient-to-b from-[#070314] via-[#04020b] to-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 transition hover:opacity-90">
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
              {t("app.name")}
            </span>
            <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55">
              {t("encyclopedia.kicker")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <nav className="hidden gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 md:flex" aria-label={t("encyclopedia.navAria")}>
              <NavLink to="/encyclopedia" end className={subTab}>
                {t("encyclopedia.navPlanets")}
              </NavLink>
              <NavLink to="/encyclopedia/missions" className={subTab}>
                {t("encyclopedia.navMissions")}
              </NavLink>
              <NavLink to="/encyclopedia/compare" className={subTab}>
                {t("encyclopedia.navCompare")}
              </NavLink>
              <NavLink to="/encyclopedia/lab" className={subTab}>
                {t("encyclopedia.navLab")}
              </NavLink>
              <NavLink to="/encyclopedia/kepler" className={subTab}>
                {t("encyclopedia.navKepler")}
              </NavLink>
              <NavLink to="/encyclopedia/glossary" className={subTab}>
                {t("encyclopedia.navGlossary")}
              </NavLink>
            </nav>
            <Link
              to="/studio"
              className="hidden rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/5 sm:inline-block"
            >
              {t("encyclopedia.openStudio")}
            </Link>
            <Link
              to="/"
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/5"
            >
              {t("studio.backHome")}
            </Link>
            <SoundToggle />
            <LanguageSwitch />
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-t border-white/5 px-4 py-1.5 md:hidden"
          aria-label={t("encyclopedia.navAria")}
        >
          <NavLink to="/encyclopedia" end className={subTab}>
            {t("encyclopedia.navPlanets")}
          </NavLink>
          <NavLink to="/encyclopedia/missions" className={subTab}>
            {t("encyclopedia.navMissions")}
          </NavLink>
          <NavLink to="/encyclopedia/compare" className={subTab}>
            {t("encyclopedia.navCompare")}
          </NavLink>
          <NavLink to="/encyclopedia/lab" className={subTab}>
            {t("encyclopedia.navLab")}
          </NavLink>
          <NavLink to="/encyclopedia/kepler" className={subTab}>
            {t("encyclopedia.navKepler")}
          </NavLink>
          <NavLink to="/encyclopedia/glossary" className={subTab}>
            {t("encyclopedia.navGlossary")}
          </NavLink>
        </nav>
      </header>
      <main key={location.pathname} className="route-enter mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-white/5 px-4 py-6 text-center text-[11px] text-white/35 sm:px-6">
        {t("encyclopedia.footer")}
      </footer>
    </div>
  );
}
