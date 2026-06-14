import { PLANETS, type PlanetName, type SonifyMode, type StyleId } from "@/lib/api";

const STYLES: StyleId[] = ["calm", "pop", "study", "cinematic", "drone"];

export function parsePlanetParam(v: string | null): PlanetName | null {
  if (!v) return null;
  return (PLANETS as readonly string[]).includes(v) ? (v as PlanetName) : null;
}

export function clampDays(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(7, Math.min(365, Math.round(n)));
}

export function parseDaysParam(v: string | null, fallback: number): number {
  return clampDays(Number(v), fallback);
}

export function parseSeedParam(v: string | null, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

export function parseModeParam(v: string | null, fallback: SonifyMode): SonifyMode {
  return v === "baseline" || v === "ai" ? v : fallback;
}

export function parseStyleParam(v: string | null, fallback: StyleId): StyleId {
  return STYLES.includes(v as StyleId) ? (v as StyleId) : fallback;
}

export function parseIntervalMsParam(v: string | null, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(50, Math.min(2000, Math.round(n)));
}

/** Query: use_lstm / lstm - 1, true, yes → on. */
export function parseUseLstmParam(v: string | null, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
