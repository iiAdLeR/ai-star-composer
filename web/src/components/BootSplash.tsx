import { useEffect, useState, type ReactNode } from "react";

import { isSoundEnabled, playCue } from "@/audio/uiCues";

/**
 * Branded boot screen for the first visit.
 *
 * Plays a 1.2s logo-rise + halo-pulse animation, then cross-fades into the app.
 * Returning visitors skip the splash entirely (localStorage flag). Any keypress
 * or pointer-down short-circuits the animation to a 200ms fade-out.
 *
 * `prefers-reduced-motion` users get a 250ms opacity fade only - no scaling,
 * no blur, no movement. The accompanying audio cue (if any) is suppressed too
 * because motion sensitivity often correlates with sound sensitivity.
 *
 * A 3s hard-timeout guarantees the splash never blocks render - if asset
 * loading hangs, we drop straight to the app and silently set the seen flag
 * so the next visit is clean.
 */

const STORAGE_KEY = "ai-star-composer.booted-v1";
const HARD_TIMEOUT_MS = 3000;
const FULL_DURATION_MS = 1600;
const REDUCED_DURATION_MS = 350;
const FADE_OUT_MS = 280;

type Phase = "show" | "fade" | "done";

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readAlreadyBooted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode / disabled storage - show the splash, it can't be persisted
    // but that's preferable to crashing.
    return false;
  }
}

function markBooted(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function BootSplash({ children }: { children: ReactNode }) {
  const [reduced] = useState(readPrefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(() => (readAlreadyBooted() ? "done" : "show"));

  useEffect(() => {
    if (phase === "done") return undefined;

    // Reduced-motion users get no audio either (sensitivity often pairs up).
    // Other users hear the single A4 cue only if they haven't muted UI sound.
    // Note: most browsers gate AudioContext until first user gesture, so this
    // cue may be silent on the very first visit - that's fine, it's intended
    // as a *bonus*, not a guaranteed beat.
    if (!reduced && isSoundEnabled()) {
      playCue("boot");
    }

    const dwell = reduced ? REDUCED_DURATION_MS : FULL_DURATION_MS - FADE_OUT_MS;
    const fadeTimer = window.setTimeout(() => setPhase("fade"), dwell);
    const doneTimer = window.setTimeout(() => {
      setPhase("done");
      markBooted();
    }, dwell + FADE_OUT_MS);
    const hardTimer = window.setTimeout(() => {
      setPhase("done");
      markBooted();
    }, HARD_TIMEOUT_MS);

    const skip = () => {
      setPhase("fade");
      window.setTimeout(() => {
        setPhase("done");
        markBooted();
      }, 200);
    };
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      window.clearTimeout(hardTimer);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [phase, reduced]);

  return (
    <>
      {phase !== "done" ? (
        <div
          aria-hidden
          className={`boot-splash-root ${phase === "fade" ? "is-fading" : ""} ${reduced ? "is-reduced" : ""}`}
          role="presentation"
        >
          <div className="boot-splash-halo" />
          <img
            src="/logo-mark.svg"
            alt=""
            width={128}
            height={128}
            className="boot-splash-mark"
            draggable={false}
            decoding="async"
          />
        </div>
      ) : null}
      {children}
    </>
  );
}
