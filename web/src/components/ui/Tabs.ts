/**
 * Shared tab/segmented-control class helpers.
 *
 * Used by StudioLayout, EncyclopediaLayout, PlanetDetailPage, and KeplerLabPage
 * so the four navigation surfaces stay visually consistent. Previously the
 * same six-class string was duplicated verbatim across these files and drifted
 * apart over time (the gradient strengths and ring opacities had already
 * diverged by ~10%).
 */

export type TabSize = "sm" | "md";

const BASE_SM =
  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200";
const BASE_MD =
  "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200";

const ACTIVE =
  "text-white ring-1 ring-inset ring-white/[0.12] " +
  "bg-[linear-gradient(135deg,rgba(124,58,237,0.45),rgba(8,145,178,0.32))] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]";

const INACTIVE = "text-white/55 hover:bg-white/5 hover:text-white/90";

export function tabClasses(isActive: boolean, size: TabSize = "md"): string {
  const base = size === "sm" ? BASE_SM : BASE_MD;
  return `${base} ${isActive ? ACTIVE : INACTIVE}`;
}

/** Convenience wrapper for react-router-dom `NavLink` className callbacks. */
export function navLinkTabClass({ isActive }: { isActive: boolean }, size: TabSize = "md"): string {
  return tabClasses(isActive, size);
}
