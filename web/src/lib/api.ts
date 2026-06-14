import { getApiBase } from "@/lib/apiBase";

export const PLANETS = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
] as const;

export type PlanetName = (typeof PLANETS)[number];
export type SonifyMode = "baseline" | "ai";
export type StyleId = "calm" | "pop" | "study" | "cinematic" | "drone";

export type StyleInfo = { id: string; label_en: string; label_ar: string };

export type RenderCapabilities = {
  fluidsynth_found: boolean;
  soundfont_configured: boolean;
  lstm_checkpoint_ready?: boolean;
  max_live_sessions?: number;
};

export type HealthResponse = {
  status: string;
  api_version?: string;
  fluidsynth_on_path?: boolean;
  soundfont_configured?: boolean;
  lstm_checkpoint_ready?: boolean;
  // Detailed (?detailed=true) only — for local diagnostics
  fluidsynth_resolved?: string | null;
  fluidsynth_bin_setting?: string;
  data_dir?: string;
  outputs_dir?: string;
  allowed_bg_dir?: string;
};

export type BackgroundsResponse = { backgrounds: string[] };

export type GeneratePayload = {
  planet: string;
  days: number;
  mode: SonifyMode;
  style: StyleId;
  seed: number;
  /** Filename only, resolved server-side inside the allowed background dir. */
  nasa_background_name?: string | null;
  fg_gain?: number;
  bg_gain?: number;
  fade_ms?: number;
  ducking?: boolean;
  ducking_strength?: number;
  use_lstm?: boolean;
  lstm_device?: "cpu" | "cuda";
  /** LSTM sampling temperature (0.1 = strict / 1.8 = wild). Default 0.92. */
  lstm_temperature?: number;
};

export type SonificationMetrics = Record<string, number>;

export type PianoRollNote = {
  /** Onset, in beats (BPM-relative). */
  t: number;
  /** Duration, in beats. */
  d: number;
  /** MIDI pitch (0-127). */
  p: number;
  /** Velocity (0-127). */
  v: number;
  layer: "melody" | "lead" | "bass" | "harmony";
};

export type PianoRoll = {
  notes: PianoRollNote[];
  duration_beats: number;
  pitch_min: number;
  pitch_max: number;
};

export type GenerateResponse = {
  planet: string;
  mode: SonifyMode;
  style: string;
  count: number;
  metadata: Record<string, unknown>;
  data_json: string;
  /** True when the NASA Horizons window was served from the disk cache. */
  data_cached?: boolean;
  midi: string;
  melody_wav: string;
  melody_hq_wav: string | null;
  hybrid_wav: string | null;
  sonification_metrics: SonificationMetrics;
  fluid_render_warning?: string;
  lstm_blend?: Record<string, unknown>;
  piano_roll?: PianoRoll;
  bpm?: number;
  explanation?: SonificationExplanation;
  /** Present only when style="drone": acoustic fingerprint of this planet. */
  drone_signature?: {
    fundamental_hz: number;
    noise_center_hz: number;
    description: string;
    duration_sec: number;
  };
};

// --- Orbital Lab ---------------------------------------------------------

export interface OrbitPreviewSample {
  x: number;
  y: number;
  r: number;
  v: number;
}

export interface OrbitPreview {
  period_days: number;
  perihelion_au: number;
  aphelion_au: number;
  min_speed_km_s: number;
  max_speed_km_s: number;
  samples: OrbitPreviewSample[];
}

export interface OrbitalLabRequest {
  semi_major_axis_au: number;
  eccentricity: number;
  days?: number;
  seed?: number;
  style_id?: string;
  mode?: "baseline" | "ai";
  object_name?: string;
  samples_per_day?: number;
}

// The orbit preview is pure deterministic math (Kepler's equation +
// vis-viva), so we compute it client-side. No backend hop = instant
// sliders + works fully offline in classrooms.
import { computeOrbitPreview } from "@/lib/kepler";

export async function fetchOrbitPreview(
  semi_major_axis_au: number,
  eccentricity: number,
  samples = 240,
): Promise<OrbitPreview> {
  return computeOrbitPreview(semi_major_axis_au, eccentricity, samples) as OrbitPreview;
}

export async function runOrbitalLab(req: OrbitalLabRequest): Promise<GenerateResponse> {
  const r = await fetch(`${getApiBase().replace(/\/$/, "")}/lab/orbital`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    const detail = detailFromJson(await r.json().catch(() => null)) ?? r.statusText;
    throw new Error(`POST /lab/orbital failed: ${detail}`);
  }
  return (await r.json()) as GenerateResponse;
}

// --- Explainable Sonification --------------------------------------------

export interface ExplanationRule {
  id: string;
  title: string;
  summary: string;
  detail: string;
  input_label: string;
  input_value: number | string | number[] | string[];
  output_label: string;
  output_value: number | string | number[] | string[];
}

export interface SonificationExplanation {
  headline: string;
  planet_signature: {
    planet: string;
    tonality: string;
    rhythm: string;
    why: string;
  };
  style_influence: {
    style: string;
    bpm?: number | null;
    summary: string;
  };
  data_source: {
    provider: string;
    points_count: number;
    time_window_days: number;
    seed: number;
    speed_range_km_s: number[];
    distance_range_au: number[];
  };
  rules: ExplanationRule[];
}

// --- Compare planets -----------------------------------------------------

export interface MetricDelta {
  a: number;
  b: number;
  delta: number;
  rel: number;
}

export interface PhysicsDelta {
  a: number;
  b: number;
  delta: number;
}

export interface ComparePlanetsResponse {
  planet_a: GenerateResponse;
  planet_b: GenerateResponse;
  comparison: {
    metrics_delta: Record<string, MetricDelta>;
    physics_delta: Record<string, PhysicsDelta>;
    headline: string;
  };
}

export interface ComparePlanetsRequest {
  planet_a: string;
  planet_b: string;
  days?: number;
  seed?: number;
  style_id?: string;
  mode?: "baseline" | "ai";
}

export async function comparePlanets(req: ComparePlanetsRequest): Promise<ComparePlanetsResponse> {
  const r = await fetch(`${getApiBase().replace(/\/$/, "")}/compare/planets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    const detail = detailFromJson(await r.json().catch(() => null)) ?? r.statusText;
    throw new Error(`POST /compare/planets failed: ${detail}`);
  }
  return (await r.json()) as ComparePlanetsResponse;
}

// --- Historic Missions ---------------------------------------------------

export interface HistoricMission {
  id: string;
  mission: string;
  agency: string;
  vehicle?: string;
  launchDate: string;
  endDate?: string;
  target: string;
  status: string;
  summary?: string;
  impact?: string;
  source: string;
  category?: "first" | "lunar" | "planetary" | "deep-space" | "telescope" | "station";
  primary_target?: string;
  splashdown?: string;
}

// Historic missions are an editorial, citation-backed list — fully static,
// no NASA call needed. Ship it inside the bundle so the timeline never
// shows a skeleton because the API is busy.
import bundledMissions from "@/data/historic_missions.json";

const BUNDLED_MISSIONS: HistoricMission[] = (
  bundledMissions as { missions: HistoricMission[] }
).missions;

export async function fetchHistoricMissions(): Promise<HistoricMission[]> {
  return BUNDLED_MISSIONS;
}

// --- Encyclopedia ---------------------------------------------------------

export interface PlanetMission {
  name: string;
  agency: string;
  year: number;
  type: string;
  result: string;
}

export interface PlanetCitation {
  label: string;
  url: string;
}

export interface PlanetImage {
  url: string;
  thumb?: string;
  credit: string;
  caption: string;
  source_url?: string;
}

export interface PlanetImagery {
  hero: PlanetImage;
  gallery: PlanetImage[];
}

export interface PlanetFacts {
  name: string;
  name_ar?: string;
  name_tr?: string;
  symbol: string;
  tagline: string;
  tagline_tr?: string;
  discovery_year_text: string;
  discovered_by: string;
  named_after: string;
  physics: {
    mean_distance_au: number;
    orbital_period_days: number;
    rotation_period_hours: number;
    axial_tilt_deg: number;
    eccentricity: number;
    mean_radius_km: number;
    mass_kg: number;
    gravity_g: number;
    surface_temp_c: { min: number; max: number };
    moons: number;
    rings: boolean;
  };
  atmosphere: {
    summary: string;
    pressure_atm: number;
  };
  fun_facts: string[];
  fun_facts_tr?: string[];
  missions: PlanetMission[];
  sound_signature: {
    tonality: string;
    rhythm: string;
    why: string;
  };
  citations: PlanetCitation[];
  imagery?: PlanetImagery;
}

export interface EncyclopediaCatalog {
  schema_version: number;
  generated_at?: string;
  license?: string;
  count: number;
  planets: PlanetFacts[];
}

// Encyclopedia content is fully static (no NASA dependency), so we ship the
// canonical JSON inside the bundle. The frontend then renders instantly —
// even if the backend is unreachable or busy generating audio. The backend
// endpoints still exist for external API consumers.
import bundledPlanetFacts from "@/data/planet_facts.json";

interface BundledPlanetFactsFile {
  schema_version: number;
  generated_at?: string;
  license?: string;
  planets: Record<string, PlanetFacts>;
}

const _BUNDLED_FILE = bundledPlanetFacts as unknown as BundledPlanetFactsFile;
// Canonical solar-system order (innermost → outermost) so the hub page is
// stable regardless of object-key iteration order.
const _CANONICAL_ORDER = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"] as const;
const _ORDERED_PLANETS: PlanetFacts[] = _CANONICAL_ORDER
  .map((name) => _BUNDLED_FILE.planets[name])
  .filter(Boolean);

const BUNDLED_CATALOG: EncyclopediaCatalog = {
  schema_version: _BUNDLED_FILE.schema_version,
  generated_at: _BUNDLED_FILE.generated_at,
  license: _BUNDLED_FILE.license,
  count: _ORDERED_PLANETS.length,
  planets: _ORDERED_PLANETS,
};

const BUNDLED_PLANETS_BY_NAME: Record<string, PlanetFacts> = Object.fromEntries(
  _ORDERED_PLANETS.map((p) => [p.name.toLowerCase(), p]),
);

export async function fetchEncyclopedia(): Promise<EncyclopediaCatalog> {
  // Resolve to the bundled catalog immediately. No network hop, no skeleton.
  return BUNDLED_CATALOG;
}

export async function fetchPlanetFacts(name: string): Promise<PlanetFacts> {
  const hit = BUNDLED_PLANETS_BY_NAME[name.toLowerCase()];
  if (hit) return hit;
  throw new Error(`Unknown planet: ${name}`);
}

// --- Statistical evaluation -----------------------------------------------

export interface EvaluationPair {
  planet: string;
  style: string;
  seed: number;
  days: number;
  baseline_metrics: Record<string, number>;
  ai_metrics: Record<string, number>;
  nasa_cached: [boolean, boolean];
  walltime_sec: number;
}

export interface EvaluationMetricReport {
  metric: string;
  n: number;
  baseline_mean: number;
  baseline_std: number;
  ai_mean: number;
  ai_std: number;
  mean_delta: number;
  wilcoxon_w: number | null;
  p_value: number | null;
  cohens_dz: number | null;
  rank_biserial: number | null;
  direction: string;
}

export interface EvaluationReport {
  /** Present when fetched from /evaluation/latest (the persisted JSON). */
  report_path?: string;
  report_mtime?: number;
  config?: {
    planets: string[];
    styles: string[];
    seeds: number[];
    days: number;
    alpha: number;
  };
  pairs: EvaluationPair[];
  reports: EvaluationMetricReport[];
}

export interface EvaluationRequestBody {
  planets: string[];
  styles: string[];
  seeds: number[];
  days?: number;
  alpha?: number;
}

export async function fetchEvaluationLatest(): Promise<EvaluationReport | null> {
  const r = await fetch(`${getApiBase().replace(/\/$/, "")}/evaluation/latest`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET /evaluation/latest failed: ${r.status}`);
  return (await r.json()) as EvaluationReport;
}

export async function runEvaluation(req: EvaluationRequestBody): Promise<EvaluationReport> {
  const r = await fetch(`${getApiBase().replace(/\/$/, "")}/evaluation/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    const detail = detailFromJson(await r.json().catch(() => null)) ?? r.statusText;
    throw new Error(`POST /evaluation/run failed: ${detail}`);
  }
  return (await r.json()) as EvaluationReport;
}

export function exportBundleUrl(apiBase: string, midiPath: string | null | undefined): string | null {
  if (!midiPath) return null;
  // Backend stem = MIDI filename without extension. The backend then collects
  // every other artifact that starts with the same prefix into a zip.
  const base = midiPath.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.(mid|midi)$/i, "");
  if (!stem || !/^[A-Za-z0-9_-]{1,80}$/.test(stem)) return null;
  return `${apiBase.replace(/\/$/, "")}/export/${encodeURIComponent(stem)}.zip`;
}

export type CompareBranch = {
  midi: string;
  melody_wav: string;
  melody_hq_wav: string | null;
  hybrid_wav: string | null;
  sonification_metrics: SonificationMetrics;
  piano_roll?: PianoRoll;
  explanation?: SonificationExplanation;
};

export type CompareResponse = {
  planet: string;
  days: number;
  seed: number;
  style: string;
  data_json: string;
  data_cached?: boolean;
  count: number;
  metadata: Record<string, unknown>;
  bpm?: number;
  baseline: CompareBranch;
  ai: CompareBranch;
  comparison_summary: {
    repetition_rate_delta: number;
    unique_pitch_ratio_delta: number;
    mean_step_delta: number;
  };
  fluid_render_warning?: string;
  lstm_blend_ai?: Record<string, unknown> | null;
};

function detailFromJson(j: unknown): string | null {
  if (!j || typeof j !== "object" || !("detail" in j)) return null;
  const d = (j as { detail: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x) => {
        if (x && typeof x === "object" && "msg" in x) return String((x as { msg: unknown }).msg);
        return JSON.stringify(x);
      })
      .join("; ");
  }
  return null;
}

async function readErrorMessage(res: Response): Promise<string> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j: unknown = JSON.parse(trimmed);
      const d = detailFromJson(j);
      if (d) return d;
      if (typeof j === "object" && j !== null && "message" in j && typeof (j as { message: unknown }).message === "string") {
        return (j as { message: string }).message;
      }
    } catch {
      /* use raw text */
    }
  }
  if (trimmed.length > 0) {
    return trimmed.length > 420 ? `${trimmed.slice(0, 420)}…` : trimmed;
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(detailed = false): Promise<HealthResponse> {
  const base = getApiBase();
  const url = detailed ? `${base}/health?detailed=true` : `${base}/health`;
  const res = await fetch(url);
  return parseJson(res);
}

export async function fetchBackgrounds(): Promise<BackgroundsResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/backgrounds`);
  return parseJson(res);
}

export type ArtemisWaypoint = {
  t: number;
  date: string;
  phase:
    | "trans_lunar_injection"
    | "outbound_coast"
    | "distant_retrograde_orbit"
    | "return_coast"
    | "reentry_splashdown";
  moon: { x: number; y: number; z: number };
  moon_distance_km: number;
  rocket: { x: number; y: number; z: number };
};

export type ArtemisTrajectory = {
  mission: {
    id: string;
    mission: string;
    agency: string;
    vehicle: string;
    launchDate: string;
    splashdown?: string;
    target: string;
    status: string;
    source: string;
    window: { start: string; end: string };
  };
  source: "horizons" | "offline_fallback";
  moon_anchor_count: number;
  waypoints: ArtemisWaypoint[];
};

export async function fetchArtemisTrajectory(): Promise<ArtemisTrajectory> {
  const base = getApiBase();
  const res = await fetch(`${base}/mission/artemis`);
  return parseJson(res);
}

export async function fetchRenderCapabilities(): Promise<RenderCapabilities> {
  const base = getApiBase();
  const res = await fetch(`${base}/render/capabilities`);
  return parseJson(res);
}

export async function fetchStyles(): Promise<{ styles: StyleInfo[] }> {
  const base = getApiBase();
  const res = await fetch(`${base}/styles`);
  return parseJson(res);
}

export async function postGenerate(body: GeneratePayload): Promise<GenerateResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function postCompare(body: GeneratePayload): Promise<CompareResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

// --- Birthday gifts ------------------------------------------------------

/** Dedicated gift styles exposed by `/birthday/styles` — distinct from the
 * Studio data-sonification presets. */
export const BIRTHDAY_STYLE_IDS = [
  "celebration",
  "tender",
  "anthem",
  "waltz",
  "nebula",
] as const;

export type BirthdayStyleId = (typeof BIRTHDAY_STYLE_IDS)[number];

export interface BirthdayStyleInfo {
  id: BirthdayStyleId;
  label_en: string;
  label_ar: string;
  label_tr: string;
  description_en: string;
  description_tr: string;
  bpm: number;
  persona: string;
}

export async function fetchBirthdayStyles(): Promise<{
  styles: BirthdayStyleInfo[];
  ids: string[];
}> {
  const base = getApiBase();
  const res = await fetch(`${base}/birthday/styles`);
  return parseJson(res);
}

export interface BirthdayRequestBody {
  recipient_name: string;
  birth_date: string; // YYYY-MM-DD
  planet: string;
  style?: BirthdayStyleId;
  mode?: SonifyMode;
  /** Leave undefined → server derives a deterministic seed from name+date+planet. */
  seed?: number | null;
  /** 24..120, default 60. Number of NASA ephemeris samples across the lifetime. */
  samples?: number;
  sender_name?: string | null;
  message?: string | null;
  use_lstm?: boolean;
  lstm_temperature?: number;
}

export interface CosmicFacts {
  age_days: number;
  age_earth_years: number;
  planet_orbital_period_days: number;
  age_in_planet_years: number;
  orbits_completed_since_birth: number;
  next_anniversary_in_planet_years: number;
  approx_distance_traveled_km: number;
  approx_distance_traveled_au: number;
  average_orbital_speed_km_s: number;
  today_utc: string;
}

export interface BirthdayGiftResponse {
  token: string;
  created_at_utc: string;
  recipient_name: string;
  sender_name: string | null;
  message: string | null;
  birth_date: string;
  planet: string;
  style: BirthdayStyleId;
  mode: SonifyMode;
  seed: number;
  samples: number;
  bpm?: number;
  cosmic_facts: CosmicFacts;
  piano_roll?: PianoRoll;
  sonification_metrics?: SonificationMetrics;
  explanation?: SonificationExplanation;
  artifacts: {
    midi: string | null;
    melody_wav: string | null;
    melody_hq_wav: string | null;
    hybrid_wav: string | null;
  };
  /** Populated when FluidSynth + SoundFont rendering failed for any
   * reason (missing .sf2, wrong path, FluidSynth not on PATH). The UI
   * uses this to show "playing fallback synth" so the user knows the
   * audio quality can be improved by installing a proper SoundFont. */
  fluid_render_warning?: string | null;
  /** Populated when an LSTM checkpoint was actually blended into the
   * melody. Carries `applied`, `blended_steps`, `temperature`, etc. */
  lstm_blend?: {
    applied?: boolean;
    blended_steps?: number;
    temperature?: number;
    device?: string;
    reason?: string;
    [key: string]: unknown;
  } | null;
  share_path: string; // e.g. "/gift/<token>"
}

export async function postBirthday(body: BirthdayRequestBody): Promise<BirthdayGiftResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/birthday`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchGift(token: string): Promise<BirthdayGiftResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/gift/${encodeURIComponent(token)}`);
  return parseJson(res);
}

/** Resolve a server-returned artifact URL ("/artifacts/foo.wav") to an
 * absolute URL against the active API base. Returns null if the input
 * is empty so the caller can fall back to a default player state. */
export function resolveGiftArtifactUrl(
  apiBase: string,
  apiPath: string | null | undefined,
): string | null {
  if (!apiPath) return null;
  const trimmed = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${apiBase.replace(/\/$/, "")}${trimmed}`;
}
