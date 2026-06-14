import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Starfield } from "@/components/Starfield";

/**
 * 404 page - "lost in space".
 *
 * Reuses the calm Starfield variant (no warp burst) so accidental navigation
 * doesn't feel like a system crash. Two CTAs: back home, or jump into the
 * encyclopedia, since both are likely intents behind a mistyped URL.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05030d] px-6 text-center">
      <Starfield variant="calm" />
      <div className="relative z-10 max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-300/60">
          {t("notFound.kicker")}
        </p>
        <h1 className="mt-3 font-display text-[clamp(3rem,9vw,6rem)] font-bold leading-[1.02] tracking-[-0.045em] text-white">
          {t("notFound.title")}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
          {t("notFound.body")}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110"
          >
            {t("notFound.ctaHome")}
          </Link>
          <Link
            to="/encyclopedia"
            className="rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/[0.10]"
          >
            {t("notFound.ctaEncyclopedia")}
          </Link>
        </div>
      </div>
    </div>
  );
}
