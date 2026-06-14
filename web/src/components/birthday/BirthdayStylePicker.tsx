import { useTranslation } from "react-i18next";

import {
  BIRTHDAY_STYLE_IDS,
  type BirthdayStyleId,
  type BirthdayStyleInfo,
} from "@/lib/api";

interface BirthdayStylePickerProps {
  /** Catalog as returned by `GET /birthday/styles`. `null` = still loading,
   * empty array = catalog failed to load (we still render id-only cards). */
  catalog: BirthdayStyleInfo[] | null;
  value: BirthdayStyleId;
  onChange: (next: BirthdayStyleId) => void;
  /** Hex/CSS color used for the selected card outline. */
  accent: string;
}

/** Per-style decorative icon. Pure CSS / glyphs — no extra deps. */
const STYLE_GLYPH: Record<BirthdayStyleId, string> = {
  celebration: "✦",
  tender: "♡",
  anthem: "✺",
  waltz: "♪",
  nebula: "◯",
};

/** Per-style instrument summary shown under the title; English fallback
 * when the catalog hasn't arrived yet so the picker is never blank. */
const STYLE_INSTRUMENTS_EN: Record<BirthdayStyleId, string> = {
  celebration: "Music Box · Bass · Strings",
  tender: "Piano · Acoustic Bass · Warm Pad",
  anthem: "French Horn · Cello · Strings",
  waltz: "Harpsichord · Pizzicato · Strings",
  nebula: "Glockenspiel · Bowed Pad · Warm Pad",
};

/**
 * 5-card style picker used on `/birthday`. Each card carries:
 *   - decorative glyph + style name
 *   - one-line description (from the API; falls back to i18n)
 *   - BPM + instrument lineup
 * The whole card is the click target — much nicer than a `<select>` and
 * the picker doubles as documentation for what each style actually sounds
 * like.
 */
export function BirthdayStylePicker({
  catalog,
  value,
  onChange,
  accent,
}: BirthdayStylePickerProps) {
  const { t, i18n } = useTranslation();
  const isTr = (i18n.resolvedLanguage ?? i18n.language ?? "en")
    .toLowerCase()
    .startsWith("tr");

  // Resolve a stable order regardless of API response order.
  const byId: Record<string, BirthdayStyleInfo | undefined> = Object.fromEntries(
    (catalog ?? []).map((s) => [s.id, s]),
  );

  return (
    <div
      role="radiogroup"
      aria-label={t("birthday.form.styleAria")}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {BIRTHDAY_STYLE_IDS.map((id) => {
        const info = byId[id];
        const selected = value === id;
        const title =
          info?.[isTr ? "label_tr" : "label_en"] ||
          t(`birthday.styleCards.${id}.label`, id);
        const desc =
          (isTr ? info?.description_tr : info?.description_en) ||
          t(`birthday.styleCards.${id}.description`);
        const bpm = info?.bpm;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`group relative overflow-hidden rounded-xl border p-3 text-left transition ${
              selected ? "scale-[1.01]" : "opacity-80 hover:opacity-100"
            }`}
            style={{
              borderColor: selected
                ? accent
                : "color-mix(in srgb, white 14%, transparent)",
              background: selected
                ? `color-mix(in srgb, ${accent} 14%, rgba(255,255,255,0.02))`
                : "rgba(255,255,255,0.02)",
              boxShadow: selected
                ? `0 0 24px color-mix(in srgb, ${accent} 38%, transparent)`
                : "none",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
                style={{
                  background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                  color: accent,
                  border: `1px solid color-mix(in srgb, ${accent} 32%, transparent)`,
                }}
              >
                {STYLE_GLYPH[id]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold leading-tight text-white">
                    {title}
                  </h4>
                  {typeof bpm === "number" ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/45 tabular-nums">
                      {bpm} BPM
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">
                  {desc}
                </p>
                <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-white/35">
                  {STYLE_INSTRUMENTS_EN[id]}
                </p>
              </div>
            </div>
            {selected ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
                style={{ background: accent }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
