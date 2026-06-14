import { useMemo } from "react";

import type { OrbitPreview } from "@/lib/api";

/**
 * SVG visualization of a Keplerian orbit.
 *
 * Renders:
 * 1. The orbit path (an ellipse traced from sample positions).
 * 2. The Sun at one focus.
 * 3. The perihelion / aphelion markers with labels.
 * 4. Optional "current" marker animated along the orbit.
 * 5. Optional Kepler's 2nd-law area sweep wedges (`sweepCount > 0`).
 *
 * Pure SVG (no D3 / no canvas) so it tree-shakes to a few KB.
 */

export interface OrbitSvgProps {
  preview: OrbitPreview | null;
  /** 0..1 progress along the orbit; if set, a marker is drawn. */
  progress?: number | null;
  /** When > 0, draws N equal-time wedges (Kepler 2nd law demo). */
  sweepCount?: number;
  /** Optional 2nd orbit overlay (for comparison in Kepler 3rd law lab). */
  secondary?: OrbitPreview | null;
  className?: string;
  height?: number;
}

export function OrbitSvg({ preview, progress, sweepCount = 0, secondary, className, height = 300 }: OrbitSvgProps) {
  const { viewBox, primary, sun, peri, ap, marker, wedges, secondaryPath } = useMemo(() => {
    if (!preview || preview.samples.length === 0) {
      return {
        viewBox: "-1 -1 2 2",
        primary: "",
        sun: { x: 0, y: 0 },
        peri: { x: -1, y: 0 },
        ap: { x: 1, y: 0 },
        marker: null as null | { x: number; y: number },
        wedges: [] as string[],
        secondaryPath: "",
      };
    }
    const xs = preview.samples.map((s) => s.x);
    const ys = preview.samples.map((s) => s.y);
    if (secondary) {
      xs.push(...secondary.samples.map((s) => s.x));
      ys.push(...secondary.samples.map((s) => s.y));
    }
    const minX = Math.min(...xs, -preview.aphelion_au);
    const maxX = Math.max(...xs, preview.aphelion_au);
    const minY = Math.min(...ys, -preview.aphelion_au);
    const maxY = Math.max(...ys, preview.aphelion_au);
    const padX = (maxX - minX) * 0.12 + 0.05;
    const padY = (maxY - minY) * 0.12 + 0.05;
    const vb = `${minX - padX} ${minY - padY} ${maxX - minX + padX * 2} ${maxY - minY + padY * 2}`;

    const samples = preview.samples;
    const primaryPath = samples
      .map((s, i) => `${i === 0 ? "M" : "L"} ${s.x.toFixed(4)} ${(-s.y).toFixed(4)}`)
      .join(" ") + " Z";

    const secondaryPathStr = secondary
      ? secondary.samples
          .map((s, i) => `${i === 0 ? "M" : "L"} ${s.x.toFixed(4)} ${(-s.y).toFixed(4)}`)
          .join(" ") + " Z"
      : "";

    // Perihelion = closest to Sun (focus at origin). Aphelion = farthest.
    let periIdx = 0;
    let apIdx = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].r < samples[periIdx].r) periIdx = i;
      if (samples[i].r > samples[apIdx].r) apIdx = i;
    }
    const periPt = { x: samples[periIdx].x, y: -samples[periIdx].y };
    const apPt = { x: samples[apIdx].x, y: -samples[apIdx].y };

    // Marker along the curve at `progress`.
    let markerPt: { x: number; y: number } | null = null;
    if (progress != null && progress >= 0 && progress <= 1 && samples.length > 0) {
      const idx = Math.min(samples.length - 1, Math.floor(progress * samples.length));
      const s = samples[idx];
      markerPt = { x: s.x, y: -s.y };
    }

    // 2nd-law wedges: split samples into N equal-time arcs, draw triangles.
    const wedgeArr: string[] = [];
    if (sweepCount > 0) {
      const N = sweepCount;
      const perBucket = Math.floor(samples.length / N);
      for (let i = 0; i < N; i++) {
        const start = i * perBucket;
        const end = i === N - 1 ? samples.length - 1 : Math.min(samples.length - 1, start + perBucket);
        const pts = ["0 0"];
        for (let j = start; j <= end; j++) {
          pts.push(`${samples[j].x.toFixed(4)} ${(-samples[j].y).toFixed(4)}`);
        }
        wedgeArr.push(pts.join(" "));
      }
    }

    return {
      viewBox: vb,
      primary: primaryPath,
      sun: { x: 0, y: 0 },
      peri: periPt,
      ap: apPt,
      marker: markerPt,
      wedges: wedgeArr,
      secondaryPath: secondaryPathStr,
    };
  }, [preview, progress, secondary, sweepCount]);

  if (!preview) {
    return <div className={className} style={{ height }} />;
  }

  // Scale stroke by viewBox extent so it stays a constant visual width.
  const vbParts = viewBox.split(" ").map(parseFloat);
  const vbW = vbParts[2] || 2;
  const stroke = vbW * 0.004;
  const dotR = vbW * 0.012;
  const markerR = vbW * 0.018;

  return (
    <svg
      role="img"
      aria-label="Orbit visualization"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ height, width: "100%" }}
    >
      {/* Background dots: ecliptic grid */}
      <g opacity={0.18}>
        <circle cx={0} cy={0} r={vbW * 0.001} fill="white" />
        <circle cx={0} cy={0} r={preview.aphelion_au} fill="none" stroke="white" strokeWidth={stroke * 0.3} strokeDasharray={`${stroke * 2} ${stroke * 6}`} />
      </g>

      {/* Equal-time wedges (Kepler 2nd law). Alternate fills. */}
      {wedges.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill={i % 2 === 0 ? "rgba(34, 211, 238, 0.13)" : "rgba(167, 139, 250, 0.13)"}
          stroke={i % 2 === 0 ? "rgba(34, 211, 238, 0.55)" : "rgba(167, 139, 250, 0.55)"}
          strokeWidth={stroke * 0.6}
          strokeLinejoin="round"
        />
      ))}

      {/* Secondary orbit (comparison) */}
      {secondaryPath ? (
        <path
          d={secondaryPath}
          fill="none"
          stroke="rgba(244, 114, 182, 0.75)"
          strokeWidth={stroke * 1.2}
          strokeDasharray={`${stroke * 3} ${stroke * 3}`}
        />
      ) : null}

      {/* Primary orbit */}
      <path d={primary} fill="none" stroke="rgba(34, 211, 238, 0.85)" strokeWidth={stroke * 1.6} />

      {/* Perihelion + aphelion markers */}
      <circle cx={peri.x} cy={peri.y} r={dotR * 0.9} fill="rgba(250, 204, 21, 0.95)" />
      <circle cx={ap.x} cy={ap.y} r={dotR * 0.7} fill="rgba(148, 163, 184, 0.85)" />

      {/* Sun at one focus */}
      <circle cx={sun.x} cy={sun.y} r={dotR * 1.5} fill="rgba(250, 204, 21, 1)">
        <title>Sun</title>
      </circle>
      <circle cx={sun.x} cy={sun.y} r={dotR * 3.5} fill="rgba(250, 204, 21, 0.18)" />

      {/* Moving body marker */}
      {marker ? (
        <g>
          <line
            x1={sun.x}
            y1={sun.y}
            x2={marker.x}
            y2={marker.y}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={stroke * 0.6}
            strokeDasharray={`${stroke * 1.5} ${stroke * 1.5}`}
          />
          <circle cx={marker.x} cy={marker.y} r={markerR} fill="rgba(167, 139, 250, 1)">
            <title>Current position</title>
          </circle>
        </g>
      ) : null}
    </svg>
  );
}
