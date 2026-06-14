import { useTranslation } from "react-i18next";

import type { AppLanguage } from "@/i18n/config";
import { SUPPORTED_LANGUAGES } from "@/i18n/config";

const FLAGS: Record<AppLanguage, string> = {
  en: "EN",
  tr: "TR",
};

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();

  const setLang = (lng: AppLanguage) => {
    void i18n.changeLanguage(lng);
  };

  const current = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2) as AppLanguage;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-1 py-1 backdrop-blur-md"
      role="group"
      aria-label={t("lang.label")}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => setLang(lng)}
            className={
              active
                ? "rounded-full bg-gradient-to-r from-violet-500/90 to-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/20"
                : "rounded-full px-3 py-1.5 text-xs font-medium text-white/55 transition hover:bg-white/10 hover:text-white/90"
            }
            aria-pressed={active}
          >
            {FLAGS[lng]}
          </button>
        );
      })}
    </div>
  );
}
