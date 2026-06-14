import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { playCue } from "@/audio/uiCues";
import { useToast } from "@/components/ui/Toast";
import { describeAchievement, trackEvent } from "@/lib/achievements";

/**
 * Convenience hook: call `track('app:opened', { planet: 'Mars' })` and any
 * newly-unlocked achievements automatically surface as a toast.
 *
 * Plays the dedicated "achievement" cue (a C-major arpeggio rising into the
 * upper octave) on each unlock, so users get an audible reward distinct from
 * the regular success chime. The cue is gated by the global Sound toggle, so
 * muted users stay muted.
 *
 * Important: the cue is played *outside* the per-toast loop so chained
 * unlocks (e.g. when a session finally crosses the "5 pieces" threshold) only
 * ring once — overlapping arpeggios on the same beat sound like a bug.
 */
export function useAchievementTracker() {
  const { t } = useTranslation();
  const toast = useToast();

  return useCallback(
    (eventId: string, payload?: { planet?: string }) => {
      const newly = trackEvent(eventId, payload);
      if (newly.length > 0) {
        playCue("achievement");
      }
      for (const id of newly) {
        const info = describeAchievement(id, t);
        if (!info) continue;
        toast.push(`${info.icon} ${t("achievements.unlocked", { title: info.title })}`, {
          variant: "success",
          duration: 4000,
          silent: true, // achievement cue already played above
        });
      }
    },
    [t, toast],
  );
}
