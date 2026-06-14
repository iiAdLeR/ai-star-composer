import { useTranslation } from "react-i18next";

import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

interface Props {
  /** Text to read aloud. */
  text: string;
  /** Optional explicit language hint, otherwise inferred from i18next. */
  lang?: string;
  /** Optional class override for layout. */
  className?: string;
  /** Override the visible label. */
  label?: string;
  /** Narration tempo (0.8–1.2 is sensible). */
  rate?: number;
}

/**
 * A compact "Narrate / Stop" button backed by the browser's built-in
 * speech synthesis. Renders nothing if the platform doesn't support it.
 *
 * Lives in `components/ui` because it has no domain-specific dependencies.
 */
export function NarrateButton({ text, lang, className, label, rate = 0.95 }: Props) {
  const { t, i18n } = useTranslation();
  const { supported, speaking, speak, stop } = useSpeechSynthesis();
  const detected = lang ?? (i18n.resolvedLanguage ?? i18n.language ?? "en");

  if (!supported || !text.trim()) return null;

  const onClick = () => {
    if (speaking) stop();
    else speak(text, { lang: detected, rate });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={speaking ? t("narrate.stop") : t("narrate.start")}
      aria-pressed={speaking}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
        speaking
          ? "border-rose-400/50 bg-rose-500/[0.12] text-rose-100 hover:bg-rose-500/[0.2]"
          : "border-white/15 bg-white/[0.05] text-white/85 hover:border-white/30 hover:bg-white/[0.1]"
      } ${className ?? ""}`}
    >
      <span aria-hidden>{speaking ? "■" : "▶"}</span>
      <span>{label ?? (speaking ? t("narrate.stop") : t("narrate.start"))}</span>
    </button>
  );
}
