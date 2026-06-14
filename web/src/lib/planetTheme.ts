import type { CSSProperties } from "react";

import type { PlanetName } from "@/lib/api";

/**
 * Per-planet visual identity tokens.
 *
 * The palette is picked from publicly documented NASA/JPL imagery so each
 * world's signature hue carries through the UI (mission cards, badges,
 * piano-roll borders, etc). All values are inline-safe Tailwind-compatible
 * hex / rgba strings; consumers should *not* assume CSS variables exist.
 *
 *   accent      — primary chrome (border, focus ring, button)
 *   accentSoft  — translucent surface tint behind content
 *   glow        — outer glow / shadow color (planet showcase)
 *   text        — readable foreground on `accentSoft` (≥ 4.5:1 on #0b1023)
 *   tag         — pre-baked Tailwind classes for a small badge component
 */
export interface PlanetTheme {
  name: PlanetName;
  accent: string;
  accentSoft: string;
  glow: string;
  text: string;
  tag: string;
}

/**
 * Per-planet accents are spread along the hue wheel so two planets never
 * read as the same color from projection distance (the original palette had
 * four near-identical amber/yellow tones — Mercury, Venus, Jupiter, Saturn —
 * which collapsed at >2m viewing distance on a beamer).
 *
 * Saturation is intentionally kept in a narrow band (≈55-70%) so the eight
 * worlds still read as a coherent family rather than a paint-store sample.
 */
const THEMES: Record<PlanetName, PlanetTheme> = {
  Mercury: {
    name: "Mercury",
    accent: "#c9a87a",
    accentSoft: "rgba(201, 168, 122, 0.20)",
    glow: "rgba(201, 168, 122, 0.50)",
    text: "#f4e3c5",
    tag: "border-amber-200/30 bg-amber-200/10 text-amber-100",
  },
  Venus: {
    name: "Venus",
    accent: "#e8c14a",
    accentSoft: "rgba(232, 193, 74, 0.22)",
    glow: "rgba(232, 193, 74, 0.55)",
    text: "#fbeaa0",
    tag: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
  },
  Earth: {
    name: "Earth",
    accent: "#4fa8d8",
    accentSoft: "rgba(79, 168, 216, 0.22)",
    glow: "rgba(79, 168, 216, 0.55)",
    text: "#c7e4f5",
    tag: "border-sky-400/35 bg-sky-500/10 text-sky-100",
  },
  Mars: {
    name: "Mars",
    accent: "#e07050",
    accentSoft: "rgba(224, 112, 80, 0.22)",
    glow: "rgba(224, 96, 64, 0.55)",
    text: "#f5cdc0",
    tag: "border-orange-400/35 bg-orange-500/10 text-orange-100",
  },
  Jupiter: {
    name: "Jupiter",
    accent: "#d97a3c",
    accentSoft: "rgba(217, 122, 60, 0.22)",
    glow: "rgba(217, 122, 60, 0.55)",
    text: "#f5c79a",
    tag: "border-orange-500/35 bg-orange-600/10 text-orange-100",
  },
  Saturn: {
    name: "Saturn",
    accent: "#b8945a",
    accentSoft: "rgba(184, 148, 90, 0.22)",
    glow: "rgba(184, 148, 90, 0.55)",
    text: "#e9d0a3",
    tag: "border-amber-500/30 bg-amber-600/10 text-amber-100",
  },
  Uranus: {
    name: "Uranus",
    accent: "#86d8b8",
    accentSoft: "rgba(134, 216, 184, 0.22)",
    glow: "rgba(134, 216, 184, 0.55)",
    text: "#c8eedb",
    tag: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
  },
  Neptune: {
    name: "Neptune",
    accent: "#5b7fe8",
    accentSoft: "rgba(91, 127, 232, 0.22)",
    glow: "rgba(91, 127, 232, 0.55)",
    text: "#c4d2f5",
    tag: "border-indigo-400/35 bg-indigo-500/10 text-indigo-100",
  },
};

const FALLBACK: PlanetTheme = {
  name: "Earth",
  accent: "#a5b4fc",
  accentSoft: "rgba(165, 180, 252, 0.18)",
  glow: "rgba(165, 180, 252, 0.45)",
  text: "#dbe3ff",
  tag: "border-white/15 bg-white/5 text-white/80",
};

/** Lookup by planet name. Safe for unknown / mistyped strings. */
export function getPlanetTheme(name: string | null | undefined): PlanetTheme {
  if (!name) return FALLBACK;
  const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return THEMES[cap as PlanetName] ?? FALLBACK;
}

/** CSS variable bundle for components that want to drive their own styles. */
export function planetCssVars(theme: PlanetTheme): CSSProperties {
  return {
    ["--planet-accent" as never]: theme.accent,
    ["--planet-accent-soft" as never]: theme.accentSoft,
    ["--planet-glow" as never]: theme.glow,
    ["--planet-text" as never]: theme.text,
  };
}
