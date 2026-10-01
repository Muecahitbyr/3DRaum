import { rectanglePolygon } from '../collision/geometry';
import { FURNITURE_CATALOG, isLamp } from '../config/furniture';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { FloorPoint, WallDimension, WallSegment } from '../types/room';
import { furniturePlanDetails, furniturePlanOutline } from '../utils/furniturePlan';
import { createWallDimensions } from '../utils/room/dimensions';
import { dimensionPoint, layoutRoomDimensions, type WallDimensionLayout } from '../utils/room/dimensionLayout';
import { openingChain, roomMeasurements, toReadingChain, type ChainSegment } from '../utils/room/measurements';
import type { RoomModel } from '../utils/room/model';
import { pointInPolygon } from '../utils/polygon';
import { formatMeters } from '../utils/units';

/**
 * Sauberer 2D-Grundriss als Bild – direkt aus den Plandaten gezeichnet (nicht vom
 * Bildschirm abfotografiert). Dadurch enthält er garantiert keine UI-Hilfselemente
 * (Auswahl, Griffe, Kollisionsmarkierungen) und ist in beliebiger Auflösung scharf.
 */

export interface PlanImageInput {
  room: RoomModel;
  openings: readonly Opening[];
  fixtures: readonly RoomFixture[];
  furniture: readonly FurnitureItem[];
}

export interface PlanImageOptions {
  /** Längste Bildseite in Pixeln (Standard 3200). */
  maxSize?: number;
  /** Möbelnamen beschriften (Standard ja). */
  labels?: boolean;
}

const COLORS = {
  background: '#ffffff',
  floor: '#f6f4f0',
  wall: '#2f3540',
  line: '#2f3540',
  furnitureFill: '#ffffff',
  furnitureLine: '#3d4450',
  dimension: '#5b6472',
  text: '#1b1f27',
  opening: '#ffffff',
  rugLine: '#b3aa9b',
} as const;

/** Rand um den Raum (m) – Platz für Maßketten. */
const MARGIN = 1.1;
/** Größte Schrift der Maße in Metern (Schrift = min(0,16 m, 34 px)). */
const MAX_FONT_M = 0.16;
/**
 * Lage der Maßebenen jenseits der Wand-Außenkante, in Schriftgrößen (Wände mit Öffnungen):
 * Öffnungsmaßkette, zweite Spur für kurze Abschnitte, Gesamtmaß (mindestens wie ohne Kette).
 */
const CHAIN_LEVELS = { line: 1.9, lane: 3.3, overall: 4.9 } as const;
/** Gesamtmaß ohne Öffnungsmaßkette (m jenseits der Außenkante) – wie bisher. */
const OVERALL_OFFSET = 0.45;
const FONT = 'Inter, Helvetica, Arial, sans-serif';

type Ctx = CanvasRenderingContext2D;

export function renderPlanImage(input: PlanImageInput, options: PlanImageOptions = {}): HTMLCanvasElement {
  const { room } = input;
  const maxSize = options.maxSize ?? 3200;
  const labels = options.labels ?? true;
  // Rand: Mit Öffnungsmaßketten liegt das Gesamtmaß weiter außen (dicke Wände brauchen mehr Platz).
  const maxThickness = Math.max(...room.walls.map((w) => w.thickness));
  const margin = input.openings.length ? Math.max(MARGIN, maxThickness + MAX_FONT_M * (CHAIN_LEVELS.overall + 1) + 0.05) : MARGIN;
  // Grundrisskoordinaten; die Hülle inkl. Wandstärken kommt aus dem Modell (Welt) → + Ursprung.
  const minX = room.outerBounds.minX + room.origin.x - margin;
  const minZ = room.outerBounds.minZ + room.origin.z - margin;
  const spanX = room.outerBounds.maxX - room.outerBounds.minX + 2 * margin;
  const spanZ = room.outerBounds.maxZ - room.outerBounds.minZ + 2 * margin;
  let s = Math.min(420, Math.max(40, maxSize / Math.max(spanX, spanZ)));
  // Fußzeile (Maßstab, Fläche) unter dem Plan; die längste Bildseite bleibt bei `maxSize`.
  const fontPx = (scale: number) => Math.min(scale * MAX_FONT_M, 34);
  if (spanZ * s + 4.6 * fontPx(s) > maxSize) s = Math.max(40, (maxSize - 4.6 * fontPx(s)) / spanZ);
  const F = fontPx(s);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(spanX * s);
  const measureContext = canvas.getContext('2d');
  if (!measureContext) throw new Error('Zeichenfläche nicht verfügbar.');
  const { area, perimeter } = roomMeasurements(room);
  const footerText = `Grundfläche ${formatMeters(area)} m²  ·  Umfang ${formatMeters(perimeter)} m`;
  const footerFont = `600 ${Math.max(11, F * 0.9)}px ${FONT}`;
  measureContext.font = footerFont;
  const scaleMeters = canvas.width / s > 12 ? 2 : 1;
  // Schmale Pläne: Fläche in eine zweite Zeile, damit sie den Maßstab nicht überdeckt.
  const twoRows = F + scaleMeters * s + F + measureContext.measureText(footerText).width + F > canvas.width;
  const planHeight = Math.round(spanZ * s);
  canvas.height = planHeight + Math.round(F * (twoRows ? 4.6 : 3));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Zeichenfläche nicht verfügbar.');

  const P = (p: FloorPoint): [number, number] => [(p.x - minX) * s, (p.z - minZ) * s];
  const px = (meters: number) => meters * s;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Boden
  path(ctx, room.polygon.map(P), true);
  ctx.fillStyle = COLORS.floor;
  ctx.fill();

  // Teppiche direkt auf dem Boden: Türbögen und alle Möbel liegen darüber (wie im Grundriss).
  const rugs = input.furniture.filter((item) => item.type === 'rug');
  for (const rug of rugs) drawFurniture(ctx, rug, P, px);

  // Wände (Gehrungsvierecke)
  for (const wall of room.walls) {
    path(ctx, wallQuad(wall).map(P), true);
    ctx.fillStyle = COLORS.wall;
    ctx.fill();
  }

  // Öffnungen: Lücke in der Wand + Symbol
  for (const opening of input.openings) {
    const wall = room.wallById.get(opening.wall);
    if (wall) drawOpening(ctx, wall, opening, P, px);
  }

  // Raumobjekte
  for (const fixture of input.fixtures) {
    const wall = room.wallById.get(fixture.wall);
    if (wall) drawFixture(ctx, wall, fixture, P, px);
  }

  // Möbel: zuerst stehende Möbel, dann Oberschränke, Deckenleuchten zuletzt (darüber).
  const layer = (item: FurnitureItem) => (item.type.includes('light') ? 2 : FURNITURE_CATALOG[item.type].wallMounted ? 1 : 0);
  const ordered = input.furniture.filter((item) => item.type !== 'rug').sort((a, b) => layer(a) - layer(b));
  for (const item of ordered) drawFurniture(ctx, item, P, px);
  if (labels) {
    // Lampe über einem Möbel (Pendel über dem Esstisch, Tischlampe): Beschriftung unter
    // das Lampensymbol, damit beide Namen lesbar bleiben.
    const below = (item: FurnitureItem) =>
      isLamp(item.type) &&
      input.furniture.some(
        (other) => other !== item && !isLamp(other.type) && pointInPolygon(item.position, rectanglePolygon(other.position, other.width / 2, other.depth / 2, other.rotationDeg)),
      );
    const stacked = stackedLabelShifts(ordered);
    // Teppiche ohne Beschriftung (liegen unter Möbeln; im PDF-Bericht aufgeführt).
    for (const item of ordered) drawLabel(ctx, item, P, px, below(item), stacked.get(item.id) ?? 0);
  }

  // Maße je Wand: Öffnungsmaßkette (falls Öffnungen) und Gesamtmaß – wie im Grundriss,
  // mit derselben gemeinsamen Platzierung der Beschriftungen (gemessene Textbreiten).
  const toPlan = (p: FloorPoint) => ({ x: p.x + room.origin.x, z: p.z + room.origin.z });
  const dimensions = createWallDimensions(room).map((d) => ({ ...d, start: toPlan(d.start), end: toPlan(d.end) }));
  const chains = room.walls.map((wall) => {
    const spans = input.openings.filter((o) => o.wall === wall.id);
    return spans.length ? toReadingChain(wall, openingChain(wall.length, spans)) : null;
  });
  const chainFont = F * 0.8;
  const measure = (text: string, size: number) => {
    ctx.font = `600 ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  const layout = layoutRoomDimensions(dimensions, chains, {
    pxPerMeter: s,
    offsets: {
      overall: px(OVERALL_OFFSET),
      overallWithChain: Math.max(px(OVERALL_OFFSET), CHAIN_LEVELS.overall * F),
      chain: CHAIN_LEVELS.line * F,
      lane: CHAIN_LEVELS.lane * F,
    },
    gap: chainFont * 0.25,
    overallText: (length) => `${formatMeters(length)} m`,
    chainText: (length) => formatMeters(length),
    overallSize: (text) => ({ w: measure(text, F) + F * 0.8, h: F * 1.5 }),
    chainSize: (text) => ({ w: measure(text, chainFont) + chainFont * 0.6, h: chainFont * 1.3 }),
  });
  dimensions.forEach((dimension, i) => {
    const chain = chains[i];
    if (chain) drawChain(ctx, dimension, chain, layout[i], chainFont, F / s, P, px);
    drawDimension(ctx, dimension, layout[i], F, P, px);
  });

  drawFooter(ctx, canvas, s, planHeight, F, scaleMeters, footerFont, footerText, twoRows);
  return canvas;
}

// ---------------------------------------------------------------- Hilfen

function path(ctx: Ctx, points: [number, number][], close: boolean) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
}

const at = (wall: WallSegment, along: number, into: number): FloorPoint => ({
  x: wall.planStart.x + wall.axis.x * along + wall.inward.x * into,
  z: wall.planStart.z + wall.axis.z * along + wall.inward.z * into,
});

function wallQuad(wall: WallSegment): FloorPoint[] {
  return [at(wall, 0, 0), at(wall, wall.length, 0), at(wall, wall.outerEnd, -wall.thickness), at(wall, wall.outerStart, -wall.thickness)];
}

function stroke(ctx: Ctx, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawOpening(ctx: Ctx, wall: WallSegment, opening: Opening, P: (p: FloorPoint) => [number, number], px: (m: number) => number) {
  const t = wall.thickness;
  const a0 = opening.offset;
  const a1 = opening.offset + opening.width;
  path(ctx, [at(wall, a0, 0), at(wall, a1, 0), at(wall, a1, -t), at(wall, a0, -t)].map(P), true);
  ctx.fillStyle = COLORS.opening;
  ctx.fill();
  const thin = Math.max(1.5, px(0.012));
  // Laibungen
  for (const a of [a0, a1]) {
    path(ctx, [P(at(wall, a, 0)), P(at(wall, a, -t))], false);
    stroke(ctx, COLORS.line, thin);
  }
  if (opening.type === 'passage') {
    // Durchgang: Sturz über der Schnittebene gestrichelt an beiden Wandflächen.
    ctx.save();
    ctx.setLineDash([px(0.06), px(0.05)]);
    for (const into of [0, -t]) {
      path(ctx, [P(at(wall, a0, into)), P(at(wall, a1, into))], false);
      stroke(ctx, COLORS.line, thin);
    }
    ctx.restore();
    return;
  }
  if (opening.type === 'window') {
    for (const into of [0, -t, -t / 2 - t * 0.12, -t / 2 + t * 0.12]) {
      path(ctx, [P(at(wall, a0, into)), P(at(wall, a1, into))], false);
      stroke(ctx, COLORS.line, thin);
    }
    if (opening.sashes === 2) {
      const mid = (a0 + a1) / 2;
      path(ctx, [P(at(wall, mid, 0)), P(at(wall, mid, -t))], false);
      stroke(ctx, COLORS.line, thin);
    }
    return;
  }
  // Tür: Blatt (senkrecht zur Wand) und Öffnungsbogen – Anschlag links = Wandanfang.
  const hingeAlong = opening.hinge === 'left' ? a0 : a1;
  const strikeAlong = opening.hinge === 'left' ? a1 : a0;
  const face = opening.swing === 'outward' ? -t : 0;
  const side = opening.swing === 'outward' ? -1 : 1;
  const r = opening.width;
  path(ctx, [P(at(wall, hingeAlong, face)), P(at(wall, hingeAlong, face + side * r))], false);
  stroke(ctx, COLORS.line, Math.max(2.5, px(0.03)));
  const points: [number, number][] = [];
  const dir = Math.sign(strikeAlong - hingeAlong);
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * (Math.PI / 2);
    points.push(P(at(wall, hingeAlong + dir * r * Math.cos(angle), face + side * r * Math.sin(angle))));
  }
  path(ctx, points, false);
  stroke(ctx, COLORS.line, thin);
}

function drawFixture(ctx: Ctx, wall: WallSegment, fixture: RoomFixture, P: (p: FloorPoint) => [number, number], px: (m: number) => number) {
  const a0 = fixture.offset;
  const a1 = fixture.offset + fixture.width;
  const thin = Math.max(1.2, px(0.01));
  if (fixture.type === 'radiator') {
    path(ctx, [at(wall, a0, 0), at(wall, a1, 0), at(wall, a1, fixture.depth), at(wall, a0, fixture.depth)].map(P), true);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    stroke(ctx, COLORS.line, thin);
    path(ctx, [P(at(wall, a0, fixture.depth / 2)), P(at(wall, a1, fixture.depth / 2))], false);
    stroke(ctx, COLORS.line, thin * 0.8);
    const ticks = Math.max(2, Math.round((a1 - a0) / 0.1));
    for (let i = 1; i < ticks; i++) {
      const a = a0 + ((a1 - a0) * i) / ticks;
      path(ctx, [P(at(wall, a, fixture.depth * 0.2)), P(at(wall, a, fixture.depth * 0.8))], false);
      stroke(ctx, COLORS.line, thin * 0.7);
    }
    return;
  }
  const mid = (a0 + a1) / 2;
  const r = 0.07;
  const points: [number, number][] = [];
  if (fixture.type === 'socket') {
    for (let i = 0; i <= 20; i++) {
      const angle = (i / 20) * Math.PI;
      points.push(P(at(wall, mid + Math.cos(angle) * r, Math.sin(angle) * r)));
    }
    path(ctx, points, true);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    stroke(ctx, COLORS.line, thin);
    path(ctx, [P(at(wall, mid, r)), P(at(wall, mid, r * 1.6))], false);
    stroke(ctx, COLORS.line, thin);
    return;
  }
  const c = r * 0.9;
  for (let i = 0; i <= 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    points.push(P(at(wall, mid + Math.cos(angle) * r * 0.55, c + Math.sin(angle) * r * 0.55)));
  }
  path(ctx, points, true);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  stroke(ctx, COLORS.line, thin);
  path(ctx, [P(at(wall, mid, 0)), P(at(wall, mid, c - r * 0.55))], false);
  stroke(ctx, COLORS.line, thin);
  path(ctx, [P(at(wall, mid + r * 0.39, c + r * 0.39)), P(at(wall, mid + r * 1.1, c + r * 1.1))], false);
  stroke(ctx, COLORS.line, thin);
}

/** Lokale Möbelkoordinaten (Breite x, Tiefe z) → Grundriss, wie beim 3D-Modell gedreht. */
function furniturePoint(item: FurnitureItem, [x, z]: [number, number]): FloorPoint {
  const rad = (item.rotationDeg * Math.PI) / 180;
  return {
    x: item.position.x + Math.cos(rad) * x - Math.sin(rad) * z,
    z: item.position.z + Math.sin(rad) * x + Math.cos(rad) * z,
  };
}

function tint(item: FurnitureItem): string {
  const chosen = item.colors?.fabric ?? item.colors?.main ?? item.colors?.wood;
  if (!chosen) return COLORS.furnitureFill;
  const n = parseInt(chosen.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.8).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

function drawFurniture(ctx: Ctx, item: FurnitureItem, P: (p: FloorPoint) => [number, number], px: (m: number) => number) {
  const rug = item.type === 'rug';
  const line = rug ? COLORS.rugLine : COLORS.furnitureLine;
  // Oberschränke hängen über der Schnittebene: gestrichelt und ohne Füllung (Unterschränke bleiben sichtbar).
  const wallMounted = !!FURNITURE_CATALOG[item.type].wallMounted;
  ctx.save();
  if (wallMounted) ctx.setLineDash([px(0.06), px(0.04)]);
  const outline = furniturePlanOutline(item).map((p) => P(furniturePoint(item, p)));
  path(ctx, outline, true);
  if (!wallMounted) {
    ctx.fillStyle = tint(item);
    ctx.fill();
  }
  stroke(ctx, line, Math.max(1.5, px(0.012)));
  for (const detail of furniturePlanDetails(item.type, item)) {
    path(ctx, detail.map((p) => P(furniturePoint(item, p))), false);
    stroke(ctx, line, Math.max(1, px(0.008)));
  }
  ctx.restore();
}

/**
 * Oberschrank über einem stehenden Möbel (Unterschrank, Spüle …): Mittelpunkte liegen fast
 * aufeinander, die Beschriftungen würden sich decken. Dann steht die des Oberschranks eine halbe
 * Zeile höher (−1), die des Möbels darunter eine halbe Zeile tiefer (+1). ID → Verschiebung.
 */
export function stackedLabelShifts(furniture: readonly FurnitureItem[]): Map<string, -1 | 1> {
  const shifts = new Map<string, -1 | 1>();
  for (const top of furniture) {
    if (!FURNITURE_CATALOG[top.type].wallMounted) continue;
    const base = furniture.find(
      (other) =>
        other !== top &&
        other.type !== 'rug' &&
        !isLamp(other.type) &&
        !FURNITURE_CATALOG[other.type].wallMounted &&
        pointInPolygon(top.position, rectanglePolygon(other.position, other.width / 2, other.depth / 2, other.rotationDeg)),
    );
    if (!base) continue;
    shifts.set(top.id, -1);
    shifts.set(base.id, 1);
  }
  return shifts;
}

function drawLabel(ctx: Ctx, item: FurnitureItem, P: (p: FloorPoint) => [number, number], px: (m: number) => number, below = false, shift = 0) {
  const [x, center] = P(item.position);
  const maxWidth = px(Math.max(item.width, item.depth) * 1.1);
  let size = Math.min(px(0.13), 30);
  ctx.font = `600 ${size}px Inter, Helvetica, Arial, sans-serif`;
  while (ctx.measureText(item.name).width > maxWidth && size > 10) {
    size -= 1;
    ctx.font = `600 ${size}px Inter, Helvetica, Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = (below ? center + px(Math.max(item.width, item.depth) / 2) + size * 0.8 : center) + shift * size * 0.65;
  ctx.lineWidth = Math.max(3, size * 0.28);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(item.name, x, y);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(item.name, x, y);
}

/** Lesbarer Textwinkel entlang einer Linie (nie auf dem Kopf). */
function readableAngle(start: FloorPoint, end: FloorPoint): number {
  let angle = Math.atan2(end.z - start.z, end.x - start.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return angle;
}

/** Text mit weißem Hintergrund, entlang der Maßlinie gedreht. */
function drawMeasureText(ctx: Ctx, text: string, [x, y]: [number, number], angle: number, size: number, weight: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2, -size * 0.65, w, size * 1.3);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Öffnungsmaßkette einer Wand (Leserichtung): Linie nah an der Wand, Striche an jeder
 * Öffnungskante, Zahlen in Metern an den vorab platzierten Stellen.
 */
function drawChain(
  ctx: Ctx,
  d: WallDimension,
  segments: readonly ChainSegment[],
  layout: WallDimensionLayout,
  fontPx: number,
  fontM: number,
  P: (p: FloorPoint) => [number, number],
  px: (m: number) => number,
) {
  const line = layout.chainOffset ?? d.wallThickness;
  const dir = { x: (d.end.x - d.start.x) / d.length, z: (d.end.z - d.start.z) / d.length };
  const n = d.outwardNormal;
  const width = Math.max(1.2, px(0.008));
  path(ctx, [P(dimensionPoint(d, 0, line)), P(dimensionPoint(d, d.length, line))], false);
  stroke(ctx, COLORS.dimension, width);
  const breakpoints = [0, ...segments.map((sgm) => sgm.to)];
  for (const b of breakpoints.slice(1, -1)) {
    path(ctx, [P(dimensionPoint(d, b, d.wallThickness + 0.08)), P(dimensionPoint(d, b, line + 0.5 * fontM))], false);
    stroke(ctx, COLORS.dimension, width);
  }
  const k = 0.45 * fontM;
  for (const b of breakpoints) {
    const c = dimensionPoint(d, b, line);
    path(ctx, [P({ x: c.x - (dir.x + n.x) * k, z: c.z - (dir.z + n.z) * k }), P({ x: c.x + (dir.x + n.x) * k, z: c.z + (dir.z + n.z) * k })], false);
    stroke(ctx, COLORS.dimension, width * 1.6);
  }
  const angle = readableAngle(d.start, d.end);
  for (const label of layout.chain) drawMeasureText(ctx, label.text, P(dimensionPoint(d, label.along, label.offset)), angle, fontPx, 600);
}

/** Gesamtmaß einer Wand: Hilfslinien an den Innenecken, Maßlinie, Beschriftung an der platzierten Stelle. */
function drawDimension(
  ctx: Ctx,
  d: WallDimension,
  layout: WallDimensionLayout,
  size: number,
  P: (p: FloorPoint) => [number, number],
  px: (m: number) => number,
) {
  const { start, end, outwardNormal: n, wallThickness: thickness, length } = d;
  const off = (p: FloorPoint, dist: number): FloorPoint => ({ x: p.x + n.x * dist, z: p.z + n.z * dist });
  const line = layout.overallOffset;
  const width = Math.max(1.2, px(0.008));
  for (const p of [start, end]) {
    path(ctx, [P(off(p, thickness + 0.08)), P(off(p, line + 0.12))], false);
    stroke(ctx, COLORS.dimension, width);
  }
  path(ctx, [P(off(start, line)), P(off(end, line))], false);
  stroke(ctx, COLORS.dimension, width);
  const dir = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
  for (const p of [start, end]) {
    const c = off(p, line);
    const k = 0.07;
    path(ctx, [P({ x: c.x - (dir.x + n.x) * k, z: c.z - (dir.z + n.z) * k }), P({ x: c.x + (dir.x + n.x) * k, z: c.z + (dir.z + n.z) * k })], false);
    stroke(ctx, COLORS.dimension, width * 1.6);
  }
  ctx.save();
  ctx.translate(...P(dimensionPoint(d, layout.overall.along, line)));
  ctx.rotate(readableAngle(start, end));
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(layout.overall.text).width + size * 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2, -size * 0.75, w, size * 1.5);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(layout.overall.text, 0, 0);
  ctx.restore();
}

/** Fußzeile unter dem Plan: Maßstab links, Grundfläche und Umfang rechts (schmal: darunter). */
function drawFooter(ctx: Ctx, canvas: HTMLCanvasElement, s: number, top: number, F: number, meters: number, font: string, text: string, twoRows: boolean) {
  const x = F;
  const h = Math.max(4, F * 0.22);
  const y = top + F * 1.7;
  ctx.fillStyle = COLORS.text;
  ctx.fillRect(x, y, meters * s, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + (meters * s) / 2, y + 1, (meters * s) / 2 - 1, h - 2);
  ctx.fillStyle = COLORS.text;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${meters} m`, x, y - 4);
  if (twoRows) {
    ctx.fillText(text, x, y + h + F * 1.5);
    return;
  }
  ctx.textAlign = 'right';
  ctx.fillText(text, canvas.width - F, y + h);
}
