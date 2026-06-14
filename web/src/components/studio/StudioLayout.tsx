import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, Link, useLocation, useSearchParams } from "react-router-dom";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { navLinkTabClass } from "@/components/ui/Tabs";
import { StudioPlanetProvider, useStudioPlanet } from "@/context/StudioPlanetContext";
import { parsePlanetParam } from "@/lib/studioQuery";

const PlanetPicker3D = lazy(() =>
  import("@/components/planets/PlanetPicker3D").then((m) => ({ default: m.PlanetPicker3D })),
);

function StudioPlanetViewport() {
  const { planet, setPlanet } = useStudioPlanet();
  return <PlanetPicker3D value={planet} onChange={setPlanet} className="h-full w-full min-h-0" />;
}

/**
 * Keeps `?planet=` in sync with the 3D picker for shareable links.
 * We only apply URL → state when the query string actually changes; otherwise
 * a stale `?planet=` would overwrite the user's new choice before useEffect
 * could write the updated name (layout runs before effects).
 */
function StudioPlanetQuerySync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { planet, setPlanet } = useStudioPlanet();
  const lastPlanetInUrl = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const raw = searchParams.get("planet") ?? "";

    if (lastPlanetInUrl.current === undefined) {
      lastPlanetInUrl.current = raw;
      const parsed = parsePlanetParam(raw || null);
      if (parsed) setPlanet(parsed);
      return;
    }

    if (raw === lastPlanetInUrl.current) {
      return;
    }

    lastPlanetInUrl.current = raw;
    const parsed = parsePlanetParam(raw || null);
    if (parsed && parsed !== planet) setPlanet(parsed);
  }, [searchParams, planet, setPlanet]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("planet") === planet) return prev;
        next.set("planet", planet);
        return next;
      },
      { replace: true },
    );
  }, [planet, setSearchParams]);

  return null;
}

const tabClass = (state: { isActive: boolean }) => navLinkTabClass(state, "md");

/** One screen height, no double scroll; mobile = half planet / half controls; lg = fluid + fixed rail */
export function StudioLayout() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <StudioPlanetProvider>
      <StudioPlanetQuerySync />
      <div className="grid h-dvh w-full min-w-0 grid-cols-1 grid-rows-[50dvh_minmax(0,1fr)] overflow-hidden bg-[#030208] lg:grid-cols-[minmax(0,1fr)_clamp(320px,34vw,480px)] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section
          className="relative min-h-0 min-w-0 border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10"
          aria-label="Planet view"
        >
          <Suspense
            fallback={
              <div className="h-full w-full animate-pulse bg-gradient-to-b from-[#0a0518] via-[#05030d] to-black" />
            }
          >
            <StudioPlanetViewport />
          </Suspense>
        </section>

        <section
          className="flex min-h-0 min-w-0 flex-col overflow-hidden border-white/10 bg-black/65 backdrop-blur-2xl lg:border-l"
          aria-label="Studio controls"
        >
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
              <nav
                className="flex w-full gap-1 rounded-xl border border-white/10 bg-white/[0.06] p-1 sm:w-auto"
                aria-label={t("studio.nav.aria")}
              >
                <NavLink to="/studio" end className={tabClass}>
                  {t("studio.nav.generate")}
                </NavLink>
                <NavLink to="/studio/live" className={tabClass}>
                  {t("studio.nav.live")}
                </NavLink>
                <NavLink to="/studio/demo" className={tabClass}>
                  {t("studio.nav.demo")}
                </NavLink>
                <NavLink to="/studio/quality" className={tabClass}>
                  {t("studio.nav.quality")}
                </NavLink>
              </nav>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Link
                  to="/"
                  className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-white/85 transition hover:border-white/25 hover:bg-white/5 sm:px-4"
                >
                  {t("studio.backHome")}
                </Link>
                <SoundToggle />
                <LanguageSwitch />
              </div>
            </header>
            <div key={location.pathname} className="route-enter w-full max-w-full">
              <Outlet />
            </div>
          </div>
        </section>
      </div>
    </StudioPlanetProvider>
  );
}
