import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { playCue } from "@/audio/uiCues";

/**
 * Tiny dependency-free toast system.
 *
 * Provider mounts once at the app root and exposes `useToast()` to anywhere
 * in the tree. Toasts auto-dismiss after `duration` ms; passing 0 keeps
 * them sticky until the user closes them.
 */

export type ToastVariant = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  push: (
    message: string,
    opts?: {
      variant?: ToastVariant;
      duration?: number;
      /** Suppress the per-variant audio cue. Useful when the caller already
          plays its own (e.g. the achievement unlock arpeggio). */
      silent?: boolean;
    },
  ) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: "border-cyan-400/40 bg-cyan-500/15 text-cyan-50",
  success: "border-emerald-400/40 bg-emerald-500/15 text-emerald-50",
  warning: "border-amber-400/40 bg-amber-500/15 text-amber-50",
  error: "border-rose-400/40 bg-rose-500/15 text-rose-50",
};

const VARIANT_GLYPHS: Record<ToastVariant, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  error: "×",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Each toast gets a stable, monotonically-increasing id; useRef so we don't
  // re-create the counter when the component re-renders.
  const counter = useRef(1);
  // Per-toast timers stored in a Map so dismiss(id) can clear precisely.
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, opts?: { variant?: ToastVariant; duration?: number; silent?: boolean }) => {
      const id = counter.current;
      counter.current += 1;
      const variant: ToastVariant = opts?.variant ?? "info";
      const duration = opts?.duration ?? 4000;
      const toast: Toast = { id, message, variant, duration };
      // Cue is gated by the global Sound toggle, so silent users stay silent.
      if (!opts?.silent) {
        playCue(variant);
      }
      setToasts((prev) => {
        // Cap stack to 4 so a hot loop can't blanket the screen.
        const next = [...prev, toast];
        return next.length > 4 ? next.slice(next.length - 4) : next;
      });
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer when the provider tears down.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) window.clearTimeout(id);
      t.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col-reverse items-center gap-2 px-3 sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={`toast-enter pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-md ${VARIANT_STYLES[t.variant]}`}
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/30 font-mono text-[11px] font-bold"
            >
              {VARIANT_GLYPHS[t.variant]}
            </span>
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 ml-1 rounded-md px-2 py-0.5 text-xs text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Hard-failing here surfaces wiring mistakes early instead of silently
    // dropping notifications in production.
    throw new Error("useToast() must be used inside <ToastProvider>");
  }
  return ctx;
}
