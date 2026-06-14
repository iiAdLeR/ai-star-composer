import { useMemo } from "react";

export type StarfieldVariant = "welcome" | "calm";

type StarfieldProps = {
  /** `welcome` adds a short hyperspace-style streak burst + zoom-in on load. */
  variant?: StarfieldVariant;
};

/** Lightweight CSS starfield — no WebGL, safe for low-end laptops during defense demos. */
export function Starfield({ variant = "calm" }: StarfieldProps) {
  const stars = useMemo(() => {
    return Array.from({ length: 140 }, (_, i) => ({
      id: i,
      left: `${(i * 47 + 13 * (i % 7)) % 100}%`,
      top: `${(i * 31 + 19 * (i % 5)) % 100}%`,
      size: 1 + (i % 3),
      duration: 3 + (i % 5) * 0.8,
      delay: (i % 11) * 0.35,
    }));
  }, []);

  const rootClass =
    variant === "welcome"
      ? "pointer-events-none fixed inset-0 overflow-hidden starfield-welcome-root"
      : "pointer-events-none fixed inset-0 overflow-hidden";

  return (
    <div className={rootClass} aria-hidden>
      {variant === "welcome" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="warp-streaks-disk" />
        </div>
      ) : null}

      <div
        className="starfield-layer absolute -inset-[20%] opacity-80"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.35), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgba(6, 182, 212, 0.12), transparent),
            radial-gradient(ellipse 50% 30% at 0% 80%, rgba(167, 139, 250, 0.15), transparent)
          `,
        }}
      />
      {stars.map((s) => (
        <span
          key={s.id}
          className="star absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: 0.5,
            ["--tw-duration" as string]: `${s.duration}s`,
            ["--tw-delay" as string]: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
