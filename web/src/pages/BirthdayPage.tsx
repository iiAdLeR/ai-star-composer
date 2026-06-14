import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { CosmicCard } from "@/components/birthday/CosmicCard";
import { BirthdayStylePicker } from "@/components/birthday/BirthdayStylePicker";
import { Starfield } from "@/components/Starfield";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { useToast } from "@/components/ui/Toast";
import {
  BIRTHDAY_STYLE_IDS,
  type BirthdayGiftResponse,
  type BirthdayRequestBody,
  type BirthdayStyleId,
  type BirthdayStyleInfo,
  fetchBirthdayStyles,
  PLANETS,
  postBirthday,
} from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";

/**
 * /birthday - give someone a song their planet has been singing since
 * they were born.
 *
 * The form is intentionally compact: only "recipient name + birth date
 * + planet" are required. Everything else has a sensible default so
 * a first-time visitor can produce a gift in under 10 seconds.
 */

const MIN_BIRTH_DATE = "1900-01-01";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultBirthDate(): string {
  // Default to a date that gives ~25 years of "lifetime", which is a
  // safe non-zero starting state (avoids the MIN_AGE_DAYS=60 backend
  // check on first render).
  const now = new Date();
  now.setFullYear(now.getFullYear() - 25);
  return now.toISOString().slice(0, 10);
}

export function BirthdayPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [birthDate, setBirthDate] = useState<string>(defaultBirthDate());
  const [planet, setPlanet] = useState<(typeof PLANETS)[number]>("Earth");
  const [style, setStyle] = useState<BirthdayStyleId>("celebration");
  const [mode, setMode] = useState<"baseline" | "ai">("ai");
  const [styleCatalog, setStyleCatalog] = useState<BirthdayStyleInfo[] | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [gift, setGift] = useState<BirthdayGiftResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const theme = useMemo(() => getPlanetTheme(planet), [planet]);
  const max = todayIso();

  const canSubmit = recipientName.trim().length > 0 && birthDate.length === 10 && !submitting;

  // Fetch the rich style catalog from the API. We don't block the form on
  // it - the picker degrades to plain id labels until it arrives.
  useEffect(() => {
    let cancelled = false;
    fetchBirthdayStyles()
      .then((res) => {
        if (cancelled) return;
        setStyleCatalog(res.styles);
        if (res.styles.length > 0 && !BIRTHDAY_STYLE_IDS.includes(style)) {
          setStyle(res.styles[0].id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStyleCatalog([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setErrorMsg(null);
      const payload: BirthdayRequestBody = {
        recipient_name: recipientName.trim(),
        birth_date: birthDate,
        planet,
        style,
        mode,
        sender_name: senderName.trim() || null,
        message: message.trim() || null,
      };
      try {
        const result = await postBirthday(payload);
        setGift(result);
        toast.push(t("birthday.toasts.created", { name: result.recipient_name }), {
          variant: "success",
        });
        // Scroll the card into view on mobile.
        window.setTimeout(() => {
          document
            .getElementById("birthday-card-result")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setErrorMsg(detail);
        toast.push(t("birthday.toasts.failed", { message: detail }), { variant: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [
      canSubmit,
      recipientName,
      birthDate,
      planet,
      style,
      mode,
      senderName,
      message,
      toast,
      t,
    ],
  );

  return (
    <div className="relative min-h-dvh">
      <Starfield variant="welcome" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link to="/" className="flex items-center gap-3 transition hover:opacity-90">
          <img src="/logo-mark.svg" alt="" width={40} height={40} className="h-10 w-10" />
          <div>
            <p className="font-display text-sm font-semibold text-white">{t("app.name")}</p>
            <p className="text-xs text-white/45">{t("birthday.pageBreadcrumb")}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <LanguageSwitch />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 md:px-10">
        <div className="mb-8 text-center">
          <span
            className="inline-block rounded-full border px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em]"
            style={{
              borderColor: `color-mix(in srgb, ${theme.accent} 35%, transparent)`,
              background: theme.accentSoft,
              color: theme.text,
            }}
          >
            {t("birthday.badge")}
          </span>
          <h1 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] font-bold tracking-[-0.02em] text-white">
            {t("birthday.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-white/65">
            {t("birthday.subtitle")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md"
          >
            <Field label={t("birthday.form.recipient")}>
              <input
                type="text"
                required
                maxLength={40}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={t("birthday.form.recipientPlaceholder")}
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-violet-400/40 transition focus:border-violet-300 focus:ring-2"
              />
            </Field>

            <Field label={t("birthday.form.birthDate")}>
              <input
                type="date"
                required
                min={MIN_BIRTH_DATE}
                max={max}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-violet-400/40 transition focus:border-violet-300 focus:ring-2 [color-scheme:dark]"
              />
            </Field>

            <Field label={t("birthday.form.planet")}>
              <div className="grid grid-cols-4 gap-1.5">
                {PLANETS.map((p) => {
                  const pt = getPlanetTheme(p);
                  const selected = p === planet;
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPlanet(p)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition ${
                        selected ? "scale-[1.02]" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{
                        borderColor: selected
                          ? pt.accent
                          : "color-mix(in srgb, white 12%, transparent)",
                        background: selected ? pt.accentSoft : "rgba(255,255,255,0.02)",
                        color: selected ? pt.text : "rgba(255,255,255,0.7)",
                        boxShadow: selected ? `0 0 18px ${pt.glow}` : "none",
                      }}
                    >
                      {t(`birthday.planetNames.${p}`, p)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t("birthday.form.style")}>
              <BirthdayStylePicker
                catalog={styleCatalog}
                value={style}
                onChange={setStyle}
                accent={theme.accent}
              />
            </Field>

            <Field label={t("birthday.form.mode")}>
              <div className="grid grid-cols-2 gap-1.5">
                {(["ai", "baseline"] as const).map((m) => {
                  const selected = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        selected ? "scale-[1.01]" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{
                        borderColor: selected
                          ? theme.accent
                          : "color-mix(in srgb, white 12%, transparent)",
                        background: selected ? theme.accentSoft : "rgba(255,255,255,0.02)",
                        color: selected ? theme.text : "rgba(255,255,255,0.75)",
                        boxShadow: selected ? `0 0 16px ${theme.glow}` : "none",
                      }}
                    >
                      {t(`birthday.modes.${m}`)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t("birthday.form.sender")}>
              <input
                type="text"
                maxLength={40}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder={t("birthday.form.senderPlaceholder")}
                className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-violet-400/40 transition focus:border-violet-300 focus:ring-2"
              />
            </Field>

            <Field label={t("birthday.form.message")}>
              <textarea
                rows={3}
                maxLength={240}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("birthday.form.messagePlaceholder")}
                className="w-full resize-none rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-violet-400/40 transition focus:border-violet-300 focus:ring-2"
              />
              <p className="mt-1 text-right text-[10px] text-white/40">
                {message.length}/240
              </p>
            </Field>

            <button
              type="submit"
              disabled={!canSubmit}
              className="group relative w-full overflow-hidden rounded-xl px-6 py-3 text-base font-semibold text-white shadow-lg shadow-violet-600/30 ring-1 ring-white/10 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className="absolute inset-0 transition group-hover:opacity-95"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent}, color-mix(in srgb, ${theme.accent} 50%, #7c3aed))`,
                  opacity: 0.95,
                }}
              />
              <span className="relative font-display tracking-tight">
                {submitting ? t("birthday.form.generating") : t("birthday.form.generate")}
              </span>
            </button>

            {errorMsg ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {errorMsg}
              </p>
            ) : null}

            <p className="text-[11px] leading-relaxed text-white/45">
              {t("birthday.form.privacyNote")}
            </p>
          </form>

          <section
            id="birthday-card-result"
            className="min-h-[420px]"
            aria-live="polite"
          >
            {gift ? (
              <CosmicCard gift={gift} autoplay={false} />
            ) : (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                <div
                  aria-hidden
                  className="mb-4 flex h-20 w-20 items-center justify-center rounded-full text-3xl"
                  style={{
                    background: theme.accentSoft,
                    color: theme.accent,
                    boxShadow: `0 0 36px ${theme.glow}`,
                  }}
                >
                  ✦
                </div>
                <h2 className="font-display text-xl font-semibold text-white">
                  {t("birthday.placeholder.title")}
                </h2>
                <p className="mt-2 max-w-md text-sm text-white/55">
                  {t("birthday.placeholder.body")}
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/55">
        {label}
      </span>
      {children}
    </label>
  );
}
