import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ACHIEVEMENTS, getAchievementState, subscribeAchievements, totalUnlocked } from "@/lib/achievements";

/**
 * Compact achievements card for the Welcome page / sidebars.
 *
 * Uses a subscription pattern so unlocking an achievement (via `trackEvent`)
 * on any other page updates this view live, no key prop juggling required.
 */

export function AchievementsPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [state, setState] = useState(getAchievementState());

  useEffect(() => subscribeAchievements(setState), []);

  const { unlocked, total } = totalUnlocked();
  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md ${compact ? "p-4" : "p-5 sm:p-6"}`}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight text-white">
          {t("achievements.title")}
        </h3>
        <span className="font-mono text-[11px] text-white/55">
          {unlocked} / {total} · {pct}%
        </span>
      </header>

      {/* Progress bar */}
      <div
        aria-hidden
        className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className={`grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"}`}>
        {ACHIEVEMENTS.map((a) => {
          const isUnlocked = state.unlocked.includes(a.id);
          return (
            <li
              key={a.id}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition ${
                isUnlocked
                  ? "border-cyan-400/40 bg-cyan-500/[0.08]"
                  : "border-white/10 bg-white/[0.03] opacity-50 grayscale"
              }`}
              title={`${t(a.titleKey)} — ${t(a.descKey)}`}
            >
              <span aria-hidden className="text-xl">{a.icon}</span>
              <span className="text-[10px] font-medium leading-tight text-white/85">
                {t(a.titleKey)}
              </span>
            </li>
          );
        })}
      </ul>

      {unlocked === 0 ? (
        <p className="mt-3 text-[11px] text-white/45">{t("achievements.empty")}</p>
      ) : null}
    </section>
  );
}
