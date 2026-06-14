import type { PlanetName } from "@/lib/api";

/**
 * Relative radii (compressed so gas giants don’t dominate the viewport).
 * Jupiter/Saturn kept larger than Earth but capped vs previous 0.95/0.8.
 */
export const PLANET_VISUAL: Record<
  PlanetName,
  { color: string; emissive: string; scale: number; roughness: number; metalness: number }
> = {
  Mercury: { color: "#a8a8a8", emissive: "#111111", scale: 0.3, roughness: 0.9, metalness: 0.12 },
  Venus: { color: "#c9a24d", emissive: "#2a1f08", scale: 0.33, roughness: 0.55, metalness: 0.18 },
  Earth: { color: "#1a5f8a", emissive: "#061428", scale: 0.36, roughness: 0.62, metalness: 0.06 },
  Mars: { color: "#b8320a", emissive: "#280804", scale: 0.32, roughness: 0.78, metalness: 0.1 },
  Jupiter: { color: "#c9a882", emissive: "#1a1408", scale: 0.58, roughness: 0.72, metalness: 0.15 },
  Saturn: { color: "#d8c8a0", emissive: "#1c1810", scale: 0.52, roughness: 0.65, metalness: 0.2 },
  Uranus: { color: "#6eb8c4", emissive: "#082028", scale: 0.4, roughness: 0.4, metalness: 0.22 },
  Neptune: { color: "#2a4cb8", emissive: "#060d28", scale: 0.38, roughness: 0.38, metalness: 0.26 },
};
