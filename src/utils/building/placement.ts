import { BUILDING_CONFIG } from '../../config/building';
import { WALL_THICKNESS } from '../../config/room';
import type { FloorPoint, Meters } from '../../types/room';
import { boundsOf, dot, sub, type Bounds } from '../polygon';
import type { RoomModel } from '../room/model';
import { roundToPrecision } from '../units';

export type RoomSide = 'east' | 'south' | 'west' | 'north';
const SIDES: readonly RoomSide[] = ['east', 'south', 'west', 'north'];
const AXIS_COS = 0.999;

/** Größte Wandstärke der Wände eines Zimmers, die in diese Richtung zeigen. */
function sideThickness(room: RoomModel, side: RoomSide): Meters {
  const walls = room.walls.filter((w) => w.facing === side);
  return walls.length ? Math.max(...walls.map((w) => w.thickness)) : WALL_THICKNESS;
}

const overlaps = (a: Bounds, b: Bounds, margin: Meters) =>
  a.minX < b.maxX - margin && b.minX < a.maxX - margin && a.minZ < b.maxZ - margin && b.minZ < a.maxZ - margin;

/**
 * Lage (linke/obere Innenecke, Welt) für ein neues Zimmer der Größe `size`: Wand an Wand neben
 * dem aktiven Zimmer (rechts, unten, links, oben – die erste freie Seite), bündig mit dessen
 * Innenkante. So entsteht sofort eine gemeinsame Wand. Ist keine Seite frei, rechts neben
 * allen Zimmern der Etage mit Abstand.
 */
export function placeNewRoom(active: RoomModel | null, floorRooms: readonly RoomModel[], size: { width: Meters; length: Meters }): FloorPoint {
  if (!active) {
    if (floorRooms.length === 0) return { x: roundToPrecision(-size.width / 2), z: roundToPrecision(-size.length / 2) };
    const all = boundsOf(floorRooms.flatMap((r) => r.outerPolygon));
    return { x: roundToPrecision(all.maxX + 1), z: roundToPrecision(all.minZ + WALL_THICKNESS) };
  }
  const inner = boundsOf(active.worldPolygon);
  for (const side of SIDES) {
    const t = sideThickness(active, side);
    const position =
      side === 'east'
        ? { x: inner.maxX + t, z: inner.minZ }
        : side === 'south'
          ? { x: inner.minX, z: inner.maxZ + t }
          : side === 'west'
            ? { x: inner.minX - t - size.width, z: inner.minZ }
            : { x: inner.minX, z: inner.minZ - t - size.length };
    const candidate = { minX: position.x, maxX: position.x + size.width, minZ: position.z, maxZ: position.z + size.length };
    // Innenraum des neuen Zimmers darf kein anderes Zimmer (inkl. Wände) überdecken.
    if (floorRooms.every((room) => !overlaps(candidate, room.outerBounds, 0.01))) {
      return { x: roundToPrecision(position.x), z: roundToPrecision(position.z) };
    }
  }
  const all = boundsOf(floorRooms.flatMap((r) => r.outerPolygon));
  return { x: roundToPrecision(all.maxX + 1), z: roundToPrecision(inner.minZ) };
}

export interface RoomSnap {
  /** Korrektur der Verschiebung (Welt). */
  delta: FloorPoint;
  /** Einrastlinien (Welt) für die Anzeige. */
  guides: { from: FloorPoint; to: FloorPoint }[];
}

/** Verschiebt einen Wandpunkt. */
const moved = (p: FloorPoint, d: FloorPoint): FloorPoint => ({ x: p.x + d.x, z: p.z + d.z });

/**
 * Einrasten beim Verschieben eines Zimmers um `delta`: Eine Wand des Zimmers rastet an der
 * Außenfläche einer Nachbarwand ein (gemeinsame Wand) oder fluchtet mit einer gleich
 * gerichteten Nachbarwand. Nur achsparallele Wände, getrennt nach x und z, innerhalb von
 * `snapDistance`. Ergebnis: korrigierte Verschiebung (auf 1 cm gerundet) und Einrastlinien.
 */
export function snapRoomMove(room: RoomModel, delta: FloorPoint, others: readonly RoomModel[], snapDistance: Meters): { delta: FloorPoint; guides: RoomSnap['guides'] } {
  let best: Record<'x' | 'z', { correction: number; guide: RoomSnap['guides'][number] } | null> = { x: null, z: null };
  const consider = (axis: 'x' | 'z', correction: number, guide: RoomSnap['guides'][number]) => {
    if (Math.abs(correction) > snapDistance) return;
    const current = best[axis];
    if (!current || Math.abs(correction) < Math.abs(current.correction)) best = { ...best, [axis]: { correction, guide } };
  };

  for (const a of room.walls) {
    const axis = Math.abs(a.inward.x) >= AXIS_COS ? 'x' : Math.abs(a.inward.z) >= AXIS_COS ? 'z' : null;
    if (!axis) continue;
    const start = moved(a.start, delta);
    const end = moved(a.end, delta);
    for (const other of others) {
      for (const b of other.walls) {
        const cos = dot(a.axis, b.axis);
        if (Math.abs(cos) < AXIS_COS) continue;
        // Abstand der Innenflächen entlang der Raumrichtung von a (positiv = ins Zimmer von a).
        const into = dot(sub(b.start, start), a.inward);
        // Gegenläufig: Nachbarwand außen an a → a soll an deren Außenfläche liegen (Abstand −Dicke von b).
        // Gleichläufig: Wände fluchten (Abstand 0).
        const target = cos < 0 ? -b.thickness : 0;
        const correction = (into - target) * (axis === 'x' ? a.inward.x : a.inward.z);
        // Nur benachbarte Wände: Sie müssen sich entlang der Wand überdecken oder nahe beieinander liegen.
        const s0 = dot(sub(b.start, start), a.axis);
        const s1 = dot(sub(b.end, start), a.axis);
        const length = dot(sub(end, start), a.axis);
        const gapAlong = Math.max(0, Math.min(s0, s1) - length, -Math.max(s0, s1));
        if (cos < 0 && gapAlong > 0) continue;
        if (cos > 0 && gapAlong > BUILDING_CONFIG.newRoom.width * 2) continue;
        consider(axis, correction, { from: b.start, to: b.end });
      }
    }
  }
  const snapped = {
    x: roundToPrecision(delta.x + (best.x?.correction ?? 0)),
    z: roundToPrecision(delta.z + (best.z?.correction ?? 0)),
  };
  return { delta: snapped, guides: [best.x?.guide, best.z?.guide].filter((g): g is RoomSnap['guides'][number] => !!g) };
}

/**
 * Überschneiden sich die Innenflächen zweier Zimmer (mehr als ~1 cm)? Berührende Zimmer
 * (gemeinsame Wand, bündige Kanten) gelten nicht als Überschneidung.
 */
export function roomsOverlap(a: RoomModel, b: RoomModel): boolean {
  const ia = boundsOf(a.worldPolygon);
  const ib = boundsOf(b.worldPolygon);
  if (!overlaps(ia, ib, 0.01)) return false;
  const pa = a.worldPolygon;
  const pb = b.worldPolygon;
  // Echte Kreuzung zweier Kanten …
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      if (properCrossing(pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length])) return true;
    }
  }
  // … oder Prüfpunkte des einen Umrisses echt im anderen: Ecken, Kantenmitten und Punkte
  // knapp innerhalb jeder Ecke (erfasst bündig ausgerichtete, sich überdeckende Rechtecke).
  return probes(a).some((p) => inside(p, b)) || probes(b).some((p) => inside(p, a));
}

/** Prüfpunkte eines Umrisses (Welt). */
function probes(room: RoomModel): FloorPoint[] {
  const poly = room.worldPolygon;
  return poly.flatMap((v, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const next = poly[(i + 1) % poly.length];
    const mid = { x: (v.x + next.x) / 2, z: (v.z + next.z) / 2 };
    const d1 = sub(prev, v);
    const d2 = sub(next, v);
    const l1 = Math.hypot(d1.x, d1.z) || 1;
    const l2 = Math.hypot(d2.x, d2.z) || 1;
    const bisector = { x: d1.x / l1 + d2.x / l2, z: d1.z / l1 + d2.z / l2 };
    const len = Math.hypot(bisector.x, bisector.z) || 1;
    const step = { x: (bisector.x / len) * 0.01, z: (bisector.z / len) * 0.01 };
    let inset = { x: v.x + step.x, z: v.z + step.z };
    // Einspringende Ecke: Die Winkelhalbierende zeigt nach außen.
    if (!inside(inset, room)) inset = { x: v.x - step.x, z: v.z - step.z };
    return [v, mid, inset];
  });
}

/** Zwei Strecken kreuzen sich echt (nicht nur an Endpunkten oder kollinear). */
function properCrossing(a: FloorPoint, b: FloorPoint, c: FloorPoint, d: FloorPoint): boolean {
  const o = (p: FloorPoint, q: FloorPoint, r: FloorPoint) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  const eps = 1e-9;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

/** Punkt echt im Innenumriss (Rand zählt nicht). */
function inside(p: FloorPoint, room: RoomModel): boolean {
  const poly = room.worldPolygon;
  let result = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    // Auf dem Rand → nicht innen.
    if (onSegment(p, a, b)) return false;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

function onSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint): boolean {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const len = Math.hypot(ab.x, ab.z);
  if (len < 1e-9) return Math.hypot(ap.x, ap.z) < 1e-4;
  const cross = Math.abs(ab.x * ap.z - ab.z * ap.x) / len;
  const t = dot(ap, ab) / (len * len);
  return cross < 1e-4 && t >= -1e-6 && t <= 1 + 1e-6;
}

/** Hülle aller Außenumrisse (Welt). */
export const unionBounds = (rooms: readonly RoomModel[]): Bounds => boundsOf(rooms.flatMap((r) => r.outerPolygon));

