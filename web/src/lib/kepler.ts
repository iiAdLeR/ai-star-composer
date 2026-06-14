/**
 * Pure-TypeScript port of `services/orbital_lab.py`.
 *
 * Computing a Keplerian orbit is deterministic math (Newton–Raphson on
 * Kepler's equation M = E − e·sin E), so there's no need to round-trip
 * to the backend just to draw an ellipse. Doing it client-side means:
 *
 * - The Kepler's Laws Lab works fully offline (resilient + sellable).
 * - Sliders update instantly with zero debounce.
 * - One less endpoint to keep healthy on the API.
 *
 * Numbers match the Python implementation to ~1e-12 (same algorithm,
 * same constants).
 */

// Sun's gravitational parameter expressed in AU³ / day² so Kepler's
// 3rd Law works directly from a (AU) → T (days).
const GM_SUN_AU3_PER_DAY2 = 0.0002959122082855911;
const KM_PER_AU = 1.49597870700e8;
const SEC_PER_DAY = 86400.0;
const AU_PER_DAY_TO_KM_PER_S = KM_PER_AU / SEC_PER_DAY;

/** Kepler's 3rd Law: orbital period in days for a given semi-major axis (AU). */
export function keplerPeriodDays(semiMajorAxisAu: number): number {
  const a = Number(semiMajorAxisAu);
  if (a <= 0) throw new Error("semi_major_axis_au must be > 0");
  return 2.0 * Math.PI * Math.sqrt((a * a * a) / GM_SUN_AU3_PER_DAY2);
}

/**
 * Solve M = E − e·sin(E) for the eccentric anomaly E using Newton–Raphson.
 * Converges in 3–6 iterations for e ≤ 0.9; we cap at 32 for safety.
 */
export function solveKepler(meanAnomaly: number, eccentricity: number, maxIter = 32): number {
  const e = Number(eccentricity);
  if (!(e >= 0.0 && e < 1.0)) throw new Error("eccentricity must be in [0, 1)");
  // Normalize M to (−π, π] for numerical stability.
  const m = Math.atan2(Math.sin(meanAnomaly), Math.cos(meanAnomaly));
  let E = m + e * Math.sin(m);
  for (let i = 0; i < maxIter; i++) {
    const delta = (E - e * Math.sin(E) - m) / (1.0 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/** Convert eccentric anomaly E → true anomaly ν. */
export function trueAnomalyFromE(E: number, eccentricity: number): number {
  const e = eccentricity;
  return (
    2.0 *
    Math.atan2(
      Math.sqrt(1.0 + e) * Math.sin(E / 2.0),
      Math.sqrt(1.0 - e) * Math.cos(E / 2.0),
    )
  );
}

export interface KeplerPoint {
  index: number;
  x: number; // AU
  y: number; // AU
  r: number; // AU (radius from focus)
  speed: number; // km/s
}

/**
 * Sample a full Keplerian orbit. Default samples cover one period so the
 * SVG can draw the closed ellipse end-to-end.
 */
export function keplerianPoints(
  semiMajorAxisAu: number,
  eccentricity: number,
  samples: number,
): KeplerPoint[] {
  const a = Number(semiMajorAxisAu);
  const e = Number(eccentricity);
  if (a <= 0) throw new Error("semi_major_axis_au must be > 0");
  if (!(e >= 0.0 && e < 1.0)) throw new Error("eccentricity must be in [0, 1)");
  if (!(samples > 0)) throw new Error("samples must be > 0");

  const points: KeplerPoint[] = [];
  // Iterate uniformly in mean anomaly so we cover exactly one period.
  for (let i = 0; i < samples; i++) {
    const m = (2.0 * Math.PI * i) / samples;
    const E = solveKepler(m, e);
    const nu = trueAnomalyFromE(E, e);
    const r = a * (1.0 - e * Math.cos(E));
    const x = r * Math.cos(nu);
    const y = r * Math.sin(nu);

    // Velocity magnitude via vis-viva is more numerically stable than
    // differentiating position; speed = sqrt(μ · (2/r − 1/a)).
    const speedAuPerDay = Math.sqrt(
      GM_SUN_AU3_PER_DAY2 * Math.max(2.0 / r - 1.0 / a, 0.0),
    );
    const speedKmS = speedAuPerDay * AU_PER_DAY_TO_KM_PER_S;

    points.push({ index: i, x, y, r, speed: speedKmS });
  }
  return points;
}

export interface OrbitSummary {
  period_days: number;
  perihelion_au: number;
  aphelion_au: number;
  min_speed_km_s: number;
  max_speed_km_s: number;
  samples: Array<{ x: number; y: number; r: number; v: number }>;
}

/**
 * Compute the full orbit summary the UI needs (preview shape matches the
 * server's `/lab/orbital/preview` response exactly so callers can swap
 * back to the backend if needed).
 */
export function computeOrbitPreview(
  semiMajorAxisAu: number,
  eccentricity: number,
  samples = 240,
): OrbitSummary {
  const pts = keplerianPoints(semiMajorAxisAu, eccentricity, samples);
  let minV = Infinity;
  let maxV = -Infinity;
  const wirePoints = pts.map((p) => {
    if (p.speed < minV) minV = p.speed;
    if (p.speed > maxV) maxV = p.speed;
    return { x: p.x, y: p.y, r: p.r, v: p.speed };
  });
  return {
    period_days: keplerPeriodDays(semiMajorAxisAu),
    perihelion_au: semiMajorAxisAu * (1.0 - eccentricity),
    aphelion_au: semiMajorAxisAu * (1.0 + eccentricity),
    min_speed_km_s: minV,
    max_speed_km_s: maxV,
    samples: wirePoints,
  };
}
