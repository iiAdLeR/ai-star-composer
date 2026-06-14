import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { isSoundEnabled, playCue, subscribeSound, toggleSound } from "@/audio/uiCues";

/**
 * Header toggle: mutes/unmutes UI sound cues (hover ping, toast chimes,
 * achievement unlock arpeggio). Persists to localStorage via uiCues.ts.
 *
 * Compact (40×40) so it sits comfortably next to the LanguageSwitch.
 */
export function SoundToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(isSoundEnabled);

  useEffect(() => subscribeSound(setOn), []);

  const onClick = () => {
    const next = toggleSound();
    if (next) playCue("info");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? t("sound.mute") : t("sound.unmute")}
      title={on ? t("sound.mute") : t("sound.unmute")}
      aria-pressed={on}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/75 transition hover:border-white/25 hover:bg-white/[0.10] hover:text-white ${className ?? ""}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {on ? (
          <>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        ) : (
          <>
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </>
        )}
      </svg>
    </button>
  );
}
