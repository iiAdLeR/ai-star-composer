import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "@/components/ui/Toast";

/**
 * Renders nothing; wires window online/offline events to the toast system.
 *
 * When the browser goes offline we surface a *sticky* (duration: 0) warning
 * toast so the user understands why fresh `/generate` calls are failing.
 * When connectivity is restored we dismiss it and pop a brief success cue.
 *
 * Mount inside ToastProvider, e.g. next to AchievementBoot in App.tsx.
 */
export function OfflineWatcher() {
  const { t } = useTranslation();
  const toast = useToast();
  // Track the sticky toast's id so we can dismiss it once the connection
  // recovers, otherwise it would linger until the user manually closes it.
  const stickyId = useRef<number | null>(null);

  useEffect(() => {
    const showOffline = () => {
      if (stickyId.current !== null) return;
      stickyId.current = toast.push(t("offline.banner"), {
        variant: "warning",
        duration: 0,
      });
    };
    const showOnline = () => {
      if (stickyId.current !== null) {
        toast.dismiss(stickyId.current);
        stickyId.current = null;
        toast.push(t("offline.restored"), { variant: "success", duration: 2400 });
      }
    };

    // Initial state check - if we mount while offline, show the banner now.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showOffline();
    }

    window.addEventListener("offline", showOffline);
    window.addEventListener("online", showOnline);
    return () => {
      window.removeEventListener("offline", showOffline);
      window.removeEventListener("online", showOnline);
    };
  }, [t, toast]);

  return null;
}
