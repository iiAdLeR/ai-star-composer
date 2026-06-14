import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { GLOSSARY_LIST, type GlossaryCategory, type GlossaryEntry } from "@/data/glossary";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";

const ALL: GlossaryCategory[] = ["astronomy", "physics", "music", "ai", "data"];

const CATEGORY_LABELS: Record<GlossaryCategory, { en: string; tr: string }> = {
  astronomy: { en: "Astronomy", tr: "Astronomi" },
  physics: { en: "Physics", tr: "Fizik" },
  music: { en: "Music", tr: "Müzik" },
  ai: { en: "AI / Stats", tr: "YZ / İstatistik" },
  data: { en: "Data", tr: "Veri" },
};

export function GlossaryPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
  const isTr = lang.startsWith("tr");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | GlossaryCategory>("all");
  const track = useAchievementTracker();
  useEffect(() => {
    track("glossary:visited");
  }, [track]);

  // Scroll to anchor if URL has a hash like #lstm.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(`glossary-${hash}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_LIST.filter((e) => {
      if (cat !== "all" && e.category !== cat) return false;
      if (!q) return true;
      const hay = [e.term, e.term_tr ?? "", e.short, e.short_tr ?? "", e.full ?? "", e.full_tr ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [cat, query]);

  return (
    <>
      <section className="mb-8">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
          {t("glossary.kicker")}
        </p>
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">
          {t("glossary.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65 sm:text-base">
          {t("glossary.subtitle")}
        </p>
      </section>

      <section className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("glossary.searchPlaceholder")}
          className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/25"
        />
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:shrink-0">
          <CatPill active={cat === "all"} onClick={() => setCat("all")} label={t("glossary.allCategories")} />
          {ALL.map((c) => (
            <CatPill
              key={c}
              active={cat === c}
              onClick={() => setCat(c)}
              label={isTr ? CATEGORY_LABELS[c].tr : CATEGORY_LABELS[c].en}
            />
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/45">
          {t("glossary.noMatch")}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} isTr={isTr} />
          ))}
        </ul>
      )}
    </>
  );
}

function CatPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-gradient-to-r from-violet-600/45 to-cyan-600/35 text-white ring-1 ring-white/20"
          : "text-white/55 hover:bg-white/5 hover:text-white/90"
      }`}
    >
      {label}
    </button>
  );
}

function EntryCard({ entry, isTr }: { entry: GlossaryEntry; isTr: boolean }) {
  const title = isTr && entry.term_tr ? entry.term_tr : entry.term;
  const short = isTr && entry.short_tr ? entry.short_tr : entry.short;
  const full = isTr && entry.full_tr ? entry.full_tr : entry.full;
  const examples = isTr && entry.examples_tr?.length ? entry.examples_tr : entry.examples;

  return (
    <li
      id={`glossary-${entry.id}`}
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-white sm:text-xl">{title}</h2>
        <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/55">
          {entry.category}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/80">{short}</p>
      {full ? <p className="mt-2 text-xs leading-relaxed text-white/55">{full}</p> : null}
      {examples?.length ? (
        <div className="mt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
            {isTr ? "Örnekler" : "Examples"}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-white/65">
            {examples.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {entry.see_also?.length ? (
        <p className="mt-3 text-[11px] text-white/45">
          <span className="opacity-60">{isTr ? "Bakınız:" : "See also:"}</span>{" "}
          {entry.see_also.map((id, i) => (
            <span key={id}>
              <a href={`#glossary-${id}`} className="text-cyan-200 hover:text-cyan-100">
                {id}
              </a>
              {i < (entry.see_also?.length ?? 0) - 1 ? <span className="text-white/30"> · </span> : null}
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
}
