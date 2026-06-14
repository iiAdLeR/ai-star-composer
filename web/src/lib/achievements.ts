/**
 * Achievement system - purely localStorage, no backend, no accounts.
 *
 * Each achievement is unlocked by an `event` (a string the rest of the
 * app emits via `trackEvent(...)`). Some achievements need accumulated
 * counts (e.g. "Generated 25 pieces"), which we store in a small
 * counter map next to the unlocked set.
 *
 * Designed to feel like a Discovery layer for a museum exhibit, not a
 * leaderboard - so we never display "0/8" prominently. The only UI is
 * a Trophies panel + a passing toast when a new badge unlocks.
 */

import type i18nT from "i18next";

const STORAGE_KEY = "ai_star_composer.achievements.v1";

export interface AchievementDef {
  id: string;
  icon: string;
  titleKey: string;
  descKey: string;
  /** When true, the achievement is unlocked once `counters[counterKey] >= target`. */
  counterKey?: string;
  target?: number;
  /** Visited planets are tracked in a Set. */
  visitedAllPlanets?: boolean;
  /** A single one-shot event id. */
  eventId?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-launch", icon: "🚀", titleKey: "ach.firstLaunch.title", descKey: "ach.firstLaunch.desc", eventId: "app:opened" },
  { id: "first-generation", icon: "🎵", titleKey: "ach.firstGen.title", descKey: "ach.firstGen.desc", eventId: "studio:generate" },
  { id: "five-pieces", icon: "🎼", titleKey: "ach.fivePieces.title", descKey: "ach.fivePieces.desc", counterKey: "generate", target: 5 },
  { id: "twenty-pieces", icon: "🏆", titleKey: "ach.twentyPieces.title", descKey: "ach.twentyPieces.desc", counterKey: "generate", target: 20 },
  { id: "all-planets", icon: "🌐", titleKey: "ach.allPlanets.title", descKey: "ach.allPlanets.desc", visitedAllPlanets: true },
  { id: "comparison", icon: "⚖️", titleKey: "ach.comparison.title", descKey: "ach.comparison.desc", eventId: "studio:compare" },
  { id: "planet-vs-planet", icon: "🪐", titleKey: "ach.planetVs.title", descKey: "ach.planetVs.desc", eventId: "encyclopedia:compare" },
  { id: "lab-explorer", icon: "🧪", titleKey: "ach.lab.title", descKey: "ach.lab.desc", eventId: "lab:sonify" },
  { id: "kepler-scholar", icon: "📐", titleKey: "ach.kepler.title", descKey: "ach.kepler.desc", eventId: "kepler:visited" },
  { id: "glossary-reader", icon: "📖", titleKey: "ach.glossary.title", descKey: "ach.glossary.desc", eventId: "glossary:visited" },
  { id: "mission-historian", icon: "🕰", titleKey: "ach.missions.title", descKey: "ach.missions.desc", eventId: "missions:visited" },
  { id: "ai-listener", icon: "🤖", titleKey: "ach.ai.title", descKey: "ach.ai.desc", eventId: "studio:ai-mode" },
  { id: "demo-watcher", icon: "🎬", titleKey: "ach.demo.title", descKey: "ach.demo.desc", eventId: "demo:visited" },
];

const ALL_PLANETS = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

interface PersistedState {
  unlocked: string[];
  counters: Record<string, number>;
  visitedPlanets: string[];
}

function loadState(): PersistedState {
  if (typeof window === "undefined") {
    return { unlocked: [], counters: {}, visitedPlanets: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { unlocked: [], counters: {}, visitedPlanets: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      counters: typeof parsed.counters === "object" ? (parsed.counters as Record<string, number>) : {},
      visitedPlanets: Array.isArray(parsed.visitedPlanets) ? parsed.visitedPlanets : [],
    };
  } catch {
    return { unlocked: [], counters: {}, visitedPlanets: [] };
  }
}

function saveState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage may be disabled - ignore. */
  }
}

let _state: PersistedState | null = null;
const _listeners = new Set<(s: PersistedState) => void>();

function _getState(): PersistedState {
  if (!_state) _state = loadState();
  return _state;
}

function _setState(next: PersistedState): void {
  _state = next;
  saveState(next);
  _listeners.forEach((fn) => fn(next));
}

export function subscribeAchievements(fn: (s: PersistedState) => void): () => void {
  _listeners.add(fn);
  fn(_getState());
  return () => {
    _listeners.delete(fn);
  };
}

export function getAchievementState(): PersistedState {
  return _getState();
}

/**
 * Emit an event and unlock matching achievements.
 *
 * Returns the list of *newly* unlocked ids so the caller can show toasts.
 */
export function trackEvent(eventId: string, payload?: { planet?: string }): string[] {
  const state = { ..._getState() };
  state.counters = { ...state.counters };
  state.unlocked = [...state.unlocked];
  state.visitedPlanets = [...state.visitedPlanets];

  // Increment the "generate" counter on studio:generate and lab:sonify.
  if (eventId === "studio:generate" || eventId === "lab:sonify") {
    state.counters.generate = (state.counters.generate ?? 0) + 1;
  }

  if (payload?.planet && !state.visitedPlanets.includes(payload.planet)) {
    state.visitedPlanets.push(payload.planet);
  }

  const newly: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (state.unlocked.includes(a.id)) continue;
    let unlock = false;
    if (a.eventId && a.eventId === eventId) unlock = true;
    if (a.counterKey && (state.counters[a.counterKey] ?? 0) >= (a.target ?? 1)) unlock = true;
    if (
      a.visitedAllPlanets &&
      ALL_PLANETS.every((p) => state.visitedPlanets.includes(p))
    ) {
      unlock = true;
    }
    if (unlock) {
      state.unlocked.push(a.id);
      newly.push(a.id);
    }
  }
  if (newly.length === 0 && _state) {
    // Still write the counter / visited updates.
    _setState(state);
    return [];
  }
  _setState(state);
  return newly;
}

export function isUnlocked(id: string): boolean {
  return _getState().unlocked.includes(id);
}

export function totalUnlocked(): { unlocked: number; total: number } {
  return { unlocked: _getState().unlocked.length, total: ACHIEVEMENTS.length };
}

export function resetAchievements(): void {
  _setState({ unlocked: [], counters: {}, visitedPlanets: [] });
}

/** Convenience: lookup label/desc from i18n given a known id. */
export function describeAchievement(id: string, t: typeof i18nT.t): { icon: string; title: string; desc: string } | null {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  return { icon: def.icon, title: t(def.titleKey), desc: t(def.descKey) };
}
