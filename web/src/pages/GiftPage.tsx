import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { CosmicCard } from "@/components/birthday/CosmicCard";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Starfield } from "@/components/Starfield";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { type BirthdayGiftResponse, fetchGift } from "@/lib/api";

/**
 * /gift/<token> — shareable birthday card. The route is the recipient's
 * entry point: they open the link, see their personalized card, and the
 * song attempts to autoplay (subject to browser policy).
 */
export function GiftPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams<{ token: string }>();
  const [gift, setGift] = useState<BirthdayGiftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGift(null);
    if (!/^[a-f0-9]{24}$/i.test(token)) {
      setLoading(false);
      setError(t("birthday.gift.errorInvalid"));
      return () => {
        cancelled = true;
      };
    }
    fetchGift(token)
      .then((g) => {
        if (cancelled) return;
        setGift(g);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="relative min-h-dvh">
      <Starfield variant="welcome" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link to="/" className="flex items-center gap-3 transition hover:opacity-90">
          <img src="/logo-mark.svg" alt="" width={40} height={40} className="h-10 w-10" />
          <div>
            <p className="font-display text-sm font-semibold text-white">{t("app.name")}</p>
            <p className="text-xs text-white/45">{t("birthday.gift.breadcrumb")}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <LanguageSwitch />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-16 md:px-10">
        <div className="mb-8 text-center">
          <h1 className="font-display text-[clamp(1.6rem,4vw,2.5rem)] font-bold tracking-[-0.02em] text-white">
            {gift
              ? t("birthday.gift.titleNamed", { name: gift.recipient_name })
              : t("birthday.gift.title")}
          </h1>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-white/60">
            {t("birthday.gift.loading")}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-6 text-center text-red-200">
            <p className="font-semibold">{t("birthday.gift.errorTitle")}</p>
            <p className="mt-1 text-sm opacity-80">{error}</p>
            <Link
              to="/birthday"
              className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.05]"
            >
              {t("birthday.gift.createOne")}
            </Link>
          </div>
        ) : null}

        {gift ? (
          <>
            <CosmicCard gift={gift} autoplay />
            <p className="mt-6 text-center text-xs text-white/45">
              {t("birthday.gift.footerHint")}{" "}
              <Link to="/birthday" className="text-white/70 underline-offset-2 hover:underline">
                {t("birthday.gift.createOwn")}
              </Link>
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
