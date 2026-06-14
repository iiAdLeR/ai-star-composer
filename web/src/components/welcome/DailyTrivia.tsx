import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getDailyTrivia, getRandomTrivia, type TriviaItem } from "@/data/trivia";

const TOPIC_BADGE: Record<TriviaItem["topic"], { en: string; tr: string }> = {
  astronomy: { en: "Astronomy", tr: "Astronomi" },
  physics: { en: "Physics", tr: "Fizik" },
  history: { en: "History", tr: "Tarih" },
  exploration: { en: "Exploration", tr: "Keşif" },
  music: { en: "Music & AI", tr: "Müzik ve YZ" },
};

/**
 * "Did you know?" widget for the Welcome page.
 *
 * Day-rotated by default (same fact for everyone on the same UTC day),
 * but with a refresh button so curious visitors can keep clicking.
 */
export function DailyTrivia({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
  const isTr = lang.startsWith("tr");

  const today = useMemo(() => getDailyTrivia(), []);
  const [item, setItem] = useState<TriviaItem>(today);
  const body = isTr ? item.tr : item.en;
  const topic = isTr ? TOPIC_BADGE[item.topic].tr : TOPIC_BADGE[item.topic].en;

  return (
    <section
      className={`rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] to-rose-500/[0.04] p-5 backdrop-blur-md ${className ?? ""}`}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-amber-200/90">
          {t("trivia.title")}
        </h3>
        <span className="rounded-full border border-amber-400/30 bg-amber-500/[0.1] px-2 py-0.5 text-[10px] font-medium text-amber-100">
          {topic}
        </span>
      </header>

      <p className="font-display text-base leading-relaxed text-white/90 md:text-lg">
        {body}
      </p>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {item.source ? (
          item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-white/55 underline-offset-4 transition hover:text-amber-200 hover:underline"
            >
              {item.source} ↗
            </a>
          ) : (
            <span className="text-white/45">{item.source}</span>
          )
        ) : (
          <span className="text-white/30">{t("trivia.curatedNote")}</span>
        )}
        <button
          type="button"
          onClick={() => setItem((cur) => getRandomTrivia(cur.id))}
          className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/85 transition hover:border-amber-400/45 hover:bg-amber-500/[0.15]"
        >
          {t("trivia.another")}
        </button>
      </footer>
    </section>
  );
}
