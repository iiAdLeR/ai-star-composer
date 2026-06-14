/**
 * Client-side PDF export for planet entries.
 *
 * Uses jsPDF (pure-JS, no native deps) to produce a multi-page,
 * classroom-friendly worksheet from a PlanetFacts object. No backend
 * call, no accounts - runs entirely in the browser.
 *
 * Layout is deliberately minimalist (no embedded images) so the file
 * stays small (~30 KB) and looks correct in B&W print.
 */

import jsPDF from "jspdf";

import type { PlanetFacts } from "@/lib/api";
import { getPlanetTheme } from "@/lib/planetTheme";
import { PLANETS } from "@/lib/api";

interface Options {
  isTr?: boolean;
  /** Branding line at the footer, e.g. "AI Star Composer · v1.0". */
  brand?: string;
}

const PAGE_MARGIN_MM = 16;
const LINE_GAP_MM = 5.5;
const SECTION_GAP_MM = 7;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [120, 120, 120];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

interface Cursor {
  x: number;
  y: number;
}

function nextLine(c: Cursor, dy = LINE_GAP_MM): void {
  c.y += dy;
}

function ensureSpace(doc: jsPDF, c: Cursor, needed = 20): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (c.y + needed > pageHeight - PAGE_MARGIN_MM) {
    doc.addPage();
    c.x = PAGE_MARGIN_MM;
    c.y = PAGE_MARGIN_MM;
  }
}

function wrappedText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function sectionHeader(doc: jsPDF, c: Cursor, title: string, color: [number, number, number]): void {
  ensureSpace(doc, c, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(color[0], color[1], color[2]);
  doc.text(title, c.x, c.y);
  nextLine(c, 1.5);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.4);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.line(c.x, c.y, pageWidth - PAGE_MARGIN_MM, c.y);
  nextLine(c, 5);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
}

function paragraph(doc: jsPDF, c: Cursor, text: string, maxWidth: number): void {
  const lines = wrappedText(doc, text, maxWidth);
  for (const line of lines) {
    ensureSpace(doc, c, LINE_GAP_MM);
    doc.text(line, c.x, c.y);
    nextLine(c);
  }
}

function bulletLine(doc: jsPDF, c: Cursor, text: string, maxWidth: number): void {
  const lines = wrappedText(doc, text, maxWidth - 5);
  ensureSpace(doc, c, LINE_GAP_MM);
  doc.text("•", c.x, c.y);
  doc.text(lines[0], c.x + 4, c.y);
  nextLine(c);
  for (let i = 1; i < lines.length; i++) {
    ensureSpace(doc, c, LINE_GAP_MM);
    doc.text(lines[i], c.x + 4, c.y);
    nextLine(c);
  }
}

function kv(doc: jsPDF, c: Cursor, label: string, value: string, colWidth: number): void {
  ensureSpace(doc, c, LINE_GAP_MM);
  doc.setTextColor(110, 110, 110);
  doc.text(label, c.x, c.y);
  doc.setTextColor(20, 20, 20);
  doc.text(value, c.x + colWidth, c.y);
  nextLine(c);
}

export function exportPlanetPdf(planet: PlanetFacts, opts: Options = {}): void {
  const isTr = opts.isTr === true;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * PAGE_MARGIN_MM;
  const c: Cursor = { x: PAGE_MARGIN_MM, y: PAGE_MARGIN_MM };

  // Theme color from the planet (used for accents).
  const canonical = (PLANETS.find((p) => p.toLowerCase() === planet.name.toLowerCase()) ?? "Mars") as (typeof PLANETS)[number];
  const accent = hexToRgb(getPlanetTheme(canonical).accent);

  // --- Header ---------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  const name = isTr && planet.name_tr ? planet.name_tr : planet.name;
  doc.text(`${planet.symbol}  ${name}`, c.x, c.y + 8);
  c.y += 14;

  if (planet.tagline) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    const tg = isTr && planet.tagline_tr ? planet.tagline_tr : planet.tagline;
    paragraph(doc, c, tg, contentWidth);
  }
  nextLine(c, 2);

  // --- Discovery -----------------------------------------------------------
  sectionHeader(doc, c, isTr ? "Keşif" : "Discovery", accent);
  kv(doc, c, isTr ? "Yıl" : "Year", planet.discovery_year_text, 40);
  kv(doc, c, isTr ? "Kâşif" : "Discovered by", planet.discovered_by, 40);
  kv(doc, c, isTr ? "Adlandırma" : "Named after", planet.named_after, 40);
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Physics -------------------------------------------------------------
  sectionHeader(doc, c, isTr ? "Fizik" : "Physics", accent);
  const p = planet.physics;
  kv(doc, c, isTr ? "Ortalama mesafe" : "Mean distance", `${p.mean_distance_au.toFixed(3)} AU`, 60);
  kv(doc, c, isTr ? "Yörünge dönemi" : "Orbital period", `${p.orbital_period_days.toFixed(2)} d`, 60);
  kv(doc, c, isTr ? "Dönme süresi" : "Rotation period", `${p.rotation_period_hours.toFixed(2)} h`, 60);
  kv(doc, c, isTr ? "Eksen eğimi" : "Axial tilt", `${p.axial_tilt_deg.toFixed(2)}°`, 60);
  kv(doc, c, isTr ? "Dış merkezlik" : "Eccentricity", p.eccentricity.toFixed(4), 60);
  kv(doc, c, isTr ? "Ortalama yarıçap" : "Mean radius", `${p.mean_radius_km.toLocaleString()} km`, 60);
  kv(doc, c, isTr ? "Kütle" : "Mass", `${p.mass_kg.toExponential(3)} kg`, 60);
  kv(doc, c, isTr ? "Yüzey çekimi" : "Surface gravity", `${p.gravity_g.toFixed(3)} g`, 60);
  kv(
    doc,
    c,
    isTr ? "Yüzey sıcaklığı" : "Surface temperature",
    `${p.surface_temp_c.min}°C → ${p.surface_temp_c.max}°C`,
    60,
  );
  kv(doc, c, isTr ? "Uydular" : "Moons", String(p.moons), 60);
  kv(doc, c, isTr ? "Halkalar" : "Rings", p.rings ? (isTr ? "Var" : "Yes") : (isTr ? "Yok" : "No"), 60);
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Atmosphere ----------------------------------------------------------
  sectionHeader(doc, c, isTr ? "Atmosfer" : "Atmosphere", accent);
  paragraph(doc, c, planet.atmosphere.summary, contentWidth);
  kv(doc, c, isTr ? "Basınç" : "Pressure", `${planet.atmosphere.pressure_atm} atm`, 40);
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Sound signature -----------------------------------------------------
  sectionHeader(doc, c, isTr ? "Ses imzası" : "Sound signature", accent);
  kv(doc, c, isTr ? "Tonalite" : "Tonality", planet.sound_signature.tonality, 40);
  kv(doc, c, isTr ? "Ritim" : "Rhythm", planet.sound_signature.rhythm, 40);
  paragraph(doc, c, planet.sound_signature.why, contentWidth);
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Fun facts -----------------------------------------------------------
  sectionHeader(doc, c, isTr ? "İlginç bilgiler" : "Fun facts", accent);
  const facts = (isTr && planet.fun_facts_tr?.length ? planet.fun_facts_tr : planet.fun_facts) ?? [];
  for (const f of facts) bulletLine(doc, c, f, contentWidth);
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Missions ------------------------------------------------------------
  sectionHeader(doc, c, isTr ? "Görevler" : "Missions", accent);
  for (const m of planet.missions) {
    const line = `${m.name} · ${m.agency} · ${m.year} · ${m.result}`;
    bulletLine(doc, c, line, contentWidth);
  }
  nextLine(c, SECTION_GAP_MM - LINE_GAP_MM);

  // --- Citations -----------------------------------------------------------
  if (planet.citations?.length) {
    sectionHeader(doc, c, isTr ? "Kaynaklar" : "Sources", accent);
    for (const cit of planet.citations) {
      bulletLine(doc, c, `${cit.label} - ${cit.url}`, contentWidth);
    }
  }

  // --- Footer on every page ------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    const left = opts.brand ?? "AI Star Composer";
    const right = `${i} / ${pageCount}`;
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(left, PAGE_MARGIN_MM, pageHeight - 8);
    doc.text(right, pageWidth - PAGE_MARGIN_MM, pageHeight - 8, { align: "right" });
  }

  const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_");
  doc.save(`${safeName}.pdf`);
}
