import type { Meters } from '../types/room';
import { clamp } from '../utils/units';

/**
 * Bauteilmaße der prozeduralen Möbelmodelle, die auch die Kollisionszonen bestimmen
 * (collision/furnitureZones.ts). Modell und Kollision rechnen mit denselben Werten –
 * ein Stuhl passt genau dann zwischen die Tischbeine, wenn er es im 3D-Modell auch tut.
 */

/** Esstisch: Platte und vier Beine. */
export function tableGeometry(w: Meters, d: Meters, h: Meters) {
  const leg = 0.05;
  const topT = Math.min(0.04, h * 0.1);
  return {
    leg,
    topT,
    legH: h - topT,
    insetX: Math.min(0.07, w / 2 - leg / 2),
    insetZ: Math.min(0.07, d / 2 - leg / 2),
  };
}

/** Schreibtisch: Platte, Seitenwange links, Schubladen-Container rechts, Sichtblende hinten. */
export function deskGeometry(w: Meters, d: Meters, h: Meters) {
  const top = 0.03;
  const side = 0.025;
  const front = 0.018;
  const handle = 0.012;
  const under = h - top;
  const pedestalWidth = Math.min(0.42, w * 0.32);
  return {
    top,
    side,
    front,
    handle,
    under,
    pedestalWidth,
    pedestalDepth: d - 0.03 - front - handle,
    panelH: under * 0.45,
    /** Sichtblende: Lage (Mitte) ab Rückseite und Stärke. */
    panelFromBack: 0.05,
    panelT: 0.015,
  };
}

/** Stuhl: vier Beine, Sitzfläche, Rückenlehne hinten (−z). */
export function chairGeometry(h: Meters) {
  const seatH = clamp(h * 0.5, 0.4, 0.5);
  return { leg: 0.03, seatH, seatT: 0.045 };
}

/** Bürostuhl: Fünfsternfuß, Sitz, Armlehnen, Rückenlehne hinten (−z). */
export function officeChairGeometry(h: Meters) {
  const seatH = clamp(h * 0.44, 0.42, 0.55);
  const armH = 0.2;
  return {
    seatH,
    seatT: 0.08,
    armH,
    /** Oberkante der Armlehnen. */
    armTop: seatH + armH + 0.03,
    backH: h - seatH - 0.08,
    backDepth: 0.07,
  };
}

/**
 * Küchenmöbel: gemeinsame Bauteilmaße für Modelle und Plansymbole. Korpus auf Sockel,
 * Fronten mit Fugen, Arbeitsplatte mit kleinem Überstand nach vorn.
 */
export const KITCHEN = {
  plinth: 0.1,
  /** Rücksprung des Sockels hinter die Front. */
  plinthSetback: 0.05,
  worktop: 0.04,
  front: 0.018,
  handle: 0.012,
  gap: 0.004,
  /** Kücheninsel: Überstand der Arbeitsplatte auf der Sitzseite (−z). */
  islandOverhang: 0.25,
} as const;

/** Spüle: Becken (Breite/Tiefe) und Lage auf der Arbeitsplatte. */
export function sinkGeometry(w: Meters, d: Meters) {
  const basinW = Math.min(0.5, w - 0.2);
  const basinD = Math.min(0.4, d - 0.18);
  return { basinW, basinD, basinZ: 0.02, tapZ: -d / 2 + 0.08 };
}

/** Kochfeld: vier Kochzonen (Mittelpunkte, Radien) auf der Arbeitsplatte. */
export function hobGeometry(w: Meters, d: Meters) {
  const r = Math.min(0.1, w * 0.16);
  const dx = Math.min(0.14, w / 4);
  const dz = Math.min(0.13, d / 4);
  return { r, zones: [[-dx, -dz, r], [dx, -dz, r * 0.8], [-dx, dz, r * 0.8], [dx, dz, r]] as [number, number, number][] };
}

/** Badewanne: Wannenrand und Innenmulde. */
export function bathtubGeometry(w: Meters, d: Meters) {
  const rim = Math.min(0.08, d * 0.12);
  return { rim, innerW: w - 2 * rim, innerD: d - 2 * rim };
}
