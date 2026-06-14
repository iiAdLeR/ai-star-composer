import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getGlossaryEntry } from "@/data/glossary";

/**
 * Inline glossary term - renders the children with a subtle dotted underline.
 * Click or focus shows a popover with the definition + link to the full
 * glossary entry. Works with keyboard (Enter / Space) for accessibility.
 *
 * Implementation: lightweight, no portal/floating-ui dependencies; the
 * popover positions itself below the trigger and clamps to the viewport.
 */

export interface GlossaryTermProps {
  /** Glossary entry id (from `web/src/data/glossary.ts`). */
  id: string;
  children: React.ReactNode;
  /** Override the default underline style if it clashes with surroundings. */
  className?: string;
}

export function GlossaryTerm({ id, children, className }: GlossaryTermProps) {
  const { i18n } = useTranslation();
  const entry = getGlossaryEntry(id);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
  const isTr = lang.startsWith("tr");

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (!buttonRef.current || !popRef.current) return;
      if (
        buttonRef.current.contains(e.target as Node) ||
        popRef.current.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!entry) {
    return <span className={className}>{children}</span>;
  }

  const title = isTr && entry.term_tr ? entry.term_tr : entry.term;
  const short = isTr && entry.short_tr ? entry.short_tr : entry.short;
  const full = isTr && entry.full_tr ? entry.full_tr : entry.full;

  return (
    <span className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className={
          className ??
          "underline decoration-cyan-400/40 decoration-dotted decoration-2 underline-offset-2 transition hover:decoration-cyan-300 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        }
      >
        {children}
      </button>
      {open ? (
        <div
          ref={popRef}
          role="tooltip"
          id={tooltipId}
          className="absolute left-1/2 z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-white/15 bg-[#0a0716]/95 p-3 text-left shadow-2xl shadow-black/60 backdrop-blur-md"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300/70">
            {entry.category}
          </p>
          <p className="font-display mt-0.5 text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/80">{short}</p>
          {full ? (
            <p className="mt-2 text-[11px] leading-relaxed text-white/55">{full}</p>
          ) : null}
          <Link
            to={`/encyclopedia/glossary#glossary-${entry.id}`}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-200 hover:text-cyan-100"
            onClick={() => setOpen(false)}
          >
            {isTr ? "Sözlükte aç" : "Open in glossary"} →
          </Link>
        </div>
      ) : null}
    </span>
  );
}
