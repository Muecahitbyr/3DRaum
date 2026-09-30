import { rectanglePolygon } from '../collision/geometry';
import { isLamp } from '../config/furniture';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { FloorPoint, WallSegment } from '../types/room';
import { furniturePlanDetails, furniturePlanOutline } from '../utils/furniturePlan';
import { createWallDimensions } from '../utils/room/dimensions';
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
} as const;

/** Rand um den Raum (m) – Platz für Maßketten. */
const MARGIN = 1.1;

type Ctx = CanvasRenderingContext2D;

export function renderPlanImage(input: PlanImageInput, options: PlanImageOptions = {}): HTMLCanvasElement {
  const { room } = input;
  const maxSize = options.maxSize ?? 3200;
  const labels = options.labels ?? true;
  // Grundrisskoordinaten; die Hülle inkl. Wandstärken kommt aus dem Modell (Welt) → + Ursprung.
  const minX = room.outerBounds.minX + room.origin.x - MARGIN;
  const minZ = room.outerBounds.minZ + room.origin.z - MARGIN;
  const spanX = room.outerBounds.maxX - room.outerBounds.minX + 2 * MARGIN;
  const spanZ = room.outerBounds.maxZ - room.outerBounds.minZ + 2 * MARGIN;
  const s = Math.min(420, Math.max(40, maxSize / Math.max(spanX, spanZ)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(spanX * s);
  canvas.height = Math.round(spanZ * s);
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

  // Möbel (Deckenleuchten zuletzt, damit sie oben liegen)
  const ordered = [...input.furniture].sort((a, b) => Number(a.type.includes('light')) - Number(b.type.includes('light')));
  for (const item of ordered) drawFurniture(ctx, item, P, px);
  if (labels) {
    // Lampe über einem Möbel (Pendel über dem Esstisch, Tischlampe): Beschriftung unter
    // das Lampensymbol, damit beide Namen lesbar bleiben.
    const below = (item: FurnitureItem) =>
      isLamp(item.type) &&
      input.furniture.some(
        (other) => other !== item && !isLamp(other.type) && pointInPolygon(item.position, rectanglePolygon(other.position, other.width / 2, other.depth / 2, other.rotationDeg)),
      );
    for (const item of ordered) drawLabel(ctx, item, P, px, below(item));
  }

  // Maßketten je Wand
  for (const dimension of createWallDimensions(room)) {
    const toPlan = (p: FloorPoint) => ({ x: p.x + room.origin.x, z: p.z + room.origin.z });
    drawDimension(ctx, toPlan(dimension.start), toPlan(dimension.end), dimension.outwardNormal, dimension.wallThickness, dimension.length, P, px);
  }

  drawScaleBar(ctx, canvas, s);
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
  const outline = furniturePlanOutline(item).map((p) => P(furniturePoint(item, p)));
  path(ctx, outline, true);
  ctx.fillStyle = tint(item);
  ctx.fill();
  stroke(ctx, COLORS.furnitureLine, Math.max(1.5, px(0.012)));
  for (const line of furniturePlanDetails(item.type, item)) {
    path(ctx, line.map((p) => P(furniturePoint(item, p))), false);
    stroke(ctx, COLORS.furnitureLine, Math.max(1, px(0.008)));
  }
}

function drawLabel(ctx: Ctx, item: FurnitureItem, P: (p: FloorPoint) => [number, number], px: (m: number) => number, below = false) {
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
  const y = below ? center + px(Math.max(item.width, item.depth) / 2) + size * 0.8 : center;
  ctx.lineWidth = Math.max(3, size * 0.28);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(item.name, x, y);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(item.name, x, y);
}

function drawDimension(
  ctx: Ctx,
  start: FloorPoint,
  end: FloorPoint,
  n: FloorPoint,
  thickness: number,
  length: number,
  P: (p: FloorPoint) => [number, number],
  px: (m: number) => number,
) {
  const off = (p: FloorPoint, d: number): FloorPoint => ({ x: p.x + n.x * d, z: p.z + n.z * d });
  const line = thickness + 0.45;
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
  const [mx, my] = P(off({ x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }, line));
  let angle = Math.atan2(end.z - start.z, end.x - start.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  const size = Math.min(px(0.16), 34);
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.font = `600 ${size}px Inter, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = `${formatMeters(length)} m`;
  const w = ctx.measureText(text).width + size * 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2, -size * 0.75, w, size * 1.5);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawScaleBar(ctx: Ctx, canvas: HTMLCanvasElement, s: number) {
  const meters = canvas.width / s > 12 ? 2 : 1;
  const x = s * 0.35;
  const y = canvas.height - s * 0.3;
  const h = Math.max(4, s * 0.04);
  ctx.fillStyle = COLORS.text;
  ctx.fillRect(x, y - h, meters * s, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + (meters * s) / 2, y - h + 1, (meters * s) / 2 - 1, h - 2);
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${Math.min(s * 0.12, 28)}px Inter, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${meters} m`, x, y - h - 4);
}
