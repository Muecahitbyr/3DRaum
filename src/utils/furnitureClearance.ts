import { polygonsOverlap, rectanglePolygon } from '../collision/geometry';
import type { Polygon } from '../collision/types';
import { COLLISION_CONFIG } from '../config/collision';
import { FIXTURE_CATALOG } from '../config/fixtures';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { FloorPoint, Meters } from '../types/room';
import { fixtureFootprint, getFixtureDisplayName } from './fixtures';
import { furnitureCollide } from '../collision';
import { collisionShapeOf } from '../collision/furnitureZones';
import { furnitureBaseY } from './furniture';
import { supportElevations } from './furnitureSupport';
import type { RoomModel } from './room/model';

/**
 * Abstände eines Möbels zu den nächsten Begrenzungen im Grundriss.
 * Koordinaten: Grundriss ab Innenecke oben links (x nach rechts, z nach unten).
 *
 * Gemessen wird nicht vom Mittelpunkt, sondern die Strecke, um die sich die
 * tatsächliche (gedrehte) Grundfläche in eine Richtung verschieben ließe, bis sie
 * eine Innenwand oder ein anderes Möbel berührt. Genau diese Strecke wird bei der
 * Eingabe eines neuen Abstands verändert.
 */

export type ClearanceDirection = 'left' | 'right' | 'up' | 'down';
export const CLEARANCE_DIRECTIONS: readonly ClearanceDirection[] = ['left', 'right', 'up', 'down'];

export const DIRECTION_VECTORS: Record<ClearanceDirection, FloorPoint> = {
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
};

export type ClearanceTarget =
  | { kind: 'wall' }
  | { kind: 'furniture'; id: string; name: string }
  | { kind: 'fixture'; id: string; name: string };

export interface Clearance {
  direction: ClearanceDirection;
  /** Abstand in Metern (≥ 0). Bei Konflikt 0. */
  distance: Meters;
  /** Überschneidung mit einem Möbel in dieser Richtung – kein normaler Abstand. */
  conflict: boolean;
  /** Messstrecke: Punkt auf dem Möbel … */
  from: FloorPoint;
  /** … bis zum Hindernis. */
  to: FloorPoint;
  target: ClearanceTarget;
}

const EPS = 1e-9;
/** Punkte gelten als gleich weit entfernt (gemeinsame Kante). */
const TIE = 1e-6;
/** Messlinie bei einer gemeinsamen Kante bei 30 % statt in der Mitte (dort sitzt der Dreh-Griff). */
const BAND_POSITION = 0.3;

const cross = (a: FloorPoint, b: FloorPoint) => a.x * b.z - a.z * b.x;
const along = (p: FloorPoint, d: FloorPoint) => p.x * d.x + p.z * d.z;
const offset = (p: FloorPoint, d: FloorPoint, s: number): FloorPoint => ({ x: p.x + d.x * s, z: p.z + d.z * s });

/** Tatsächliche Grundfläche im Grundriss. */
export function furnitureFootprint(item: FurnitureItem): Polygon {
  return rectanglePolygon(item.position, item.width / 2, item.depth / 2, item.rotationDeg);
}

/** Strahl o + s·d gegen Strecke p–q; liefert s oder null. */
function raySegment(o: FloorPoint, d: FloorPoint, p: FloorPoint, q: FloorPoint): number | null {
  const e = { x: q.x - p.x, z: q.z - p.z };
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-12) return null; // parallel: wird über die Eckpunkte erfasst
  const w = { x: p.x - o.x, z: p.z - o.z };
  const u = cross(w, d) / denom;
  if (u < -EPS || u > 1 + EPS) return null;
  return cross(w, e) / denom;
}

const edges = (poly: Polygon) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as const);

/** Verschiebestrecke von A entlang d bis zur Berührung mit B (konvex); null, wenn B nicht im Weg liegt. */
function sweep(a: Polygon, b: Polygon, d: FloorPoint): { distance: number; contacts: FloorPoint[] } | null {
  const hits: { s: number; point: FloorPoint }[] = [];
  const back = { x: -d.x, z: -d.z };
  for (const p of a) for (const [q0, q1] of edges(b)) {
    const s = raySegment(p, d, q0, q1);
    if (s !== null && s >= -TIE) hits.push({ s, point: p });
  }
  for (const p of b) for (const [q0, q1] of edges(a)) {
    const s = raySegment(p, back, q0, q1);
    if (s !== null && s >= -TIE) hits.push({ s, point: offset(p, back, s) });
  }
  if (hits.length === 0) return null;
  const distance = Math.min(...hits.map((h) => h.s));
  return { distance: Math.max(0, distance), contacts: hits.filter((h) => h.s - distance < TIE).map((h) => h.point) };
}

/**
 * Abstand zur nächsten Wand in Richtung d – gegen die tatsächlichen Wandsegmente
 * (Innenflächen), auch schräge Wände und die Innenecken einer L-Form.
 */
function wallGap(poly: Polygon, direction: ClearanceDirection, room: RoomModel) {
  const d = DIRECTION_VECTORS[direction];
  let best: { distance: number; contacts: FloorPoint[] } | null = null;
  for (const wall of room.walls) {
    // Nur Wände, deren Innenseite dem Möbel zugewandt ist (von innen getroffen).
    if (wall.inward.x * d.x + wall.inward.z * d.z > -1e-9) continue;
    const hit = sweep(poly, [wall.planStart, wall.planEnd], d);
    if (!hit) continue;
    if (!best || hit.distance < best.distance - TIE) best = hit;
    else if (Math.abs(hit.distance - best.distance) < TIE) best = { distance: best.distance, contacts: [...best.contacts, ...hit.contacts] };
  }
  if (best) return best;
  const extreme = Math.max(...poly.map((p) => along(p, d)));
  return { distance: 0, contacts: poly.filter((p) => extreme - along(p, d) < TIE) };
}

/** Ansatzpunkt der Messlinie: bei gemeinsamer Kante 30 % entlang der Kante. */
function contactPoint(points: FloorPoint[], d: FloorPoint): FloorPoint {
  const acrossOf = (p: FloorPoint) => (d.x !== 0 ? p.z : p.x);
  const sorted = [...points].sort((p, q) => acrossOf(p) - acrossOf(q));
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  return { x: lo.x + (hi.x - lo.x) * BAND_POSITION, z: lo.z + (hi.z - lo.z) * BAND_POSITION };
}

const centerOf = (poly: Polygon): FloorPoint => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  z: poly.reduce((s, p) => s + p.z, 0) / poly.length,
});

/** Überschneidungen werden der Richtung zugeordnet, in der das andere Möbel überwiegend liegt. */
function overlapDirection(a: FloorPoint, b: FloorPoint): ClearanceDirection {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'right' : 'left';
  return dz >= 0 ? 'down' : 'up';
}

/**
 * Abstände nach links, rechts, oben und unten – je zum nächsten Hindernis: Wand,
 * anderes Möbel oder Heizkörper (Raumobjekte, die Möbel blockieren).
 */
export function computeClearances(
  item: FurnitureItem,
  all: readonly FurnitureItem[],
  room: RoomModel,
  fixtures: readonly RoomFixture[] = [],
): Clearance[] {
  const footprint = furnitureFootprint(item);
  const center = centerOf(footprint);
  // Nur Hindernisse in derselben Höhe: Pendelleuchte über dem Tisch, Tischlampe auf der Kommode stören nicht.
  const H = room.dimensions.height;
  const support = supportElevations(all, H);
  const y0 = furnitureBaseY(item, H, support.get(item.id));
  const y1 = y0 + item.height;
  // Drei Fälle: geometrischer Abstand (getrennte Grundflächen), erlaubte Überdeckung
  // (Grundflächen überdecken sich, die Bauteile aber nicht – Stuhl unter dem Tisch: wird
  // übergangen) und echte Kollision (Konflikt) nach dem semantischen Kollisionsmodell.
  // Teppiche sind keine Hindernisse (Kollisionsform „none“) – und messen selbst nur zu Wänden.
  const flat = (f: FurnitureItem) => collisionShapeOf(f.type) === 'none';
  const others = all
    .filter((f) => f.id !== item.id && !flat(f) && !flat(item))
    .filter((f) => {
      const b0 = furnitureBaseY(f, H, support.get(f.id));
      return Math.min(y1, b0 + f.height) - Math.max(y0, b0) > 1e-4;
    })
    .map((f) => ({ item: f, polygon: furnitureFootprint(f) }))
    .map((o) => {
      const overlaps = polygonsOverlap(footprint, o.polygon, COLLISION_CONFIG.touchTolerance);
      return { ...o, overlaps, colliding: overlaps && furnitureCollide(item, o.item, room, all) };
    })
    .filter((o) => !o.overlaps || o.colliding);
  // Heizkörper sind feste Hindernisse vor der Wand.
  const obstacles = fixtures
    .filter((f) => FIXTURE_CATALOG[f.type].collides && Math.min(y1, f.elevation + f.height) - Math.max(y0, f.elevation) > 1e-4)
    .map((f) => ({ polygon: fixtureFootprint(f, room), target: { kind: 'fixture', id: f.id, name: getFixtureDisplayName(f, fixtures) } as ClearanceTarget }))
    .filter((o): o is { polygon: FloorPoint[]; target: ClearanceTarget } => o.polygon !== null);

  return CLEARANCE_DIRECTIONS.map((direction): Clearance => {
    const d = DIRECTION_VECTORS[direction];

    // Konflikt: überschneidendes Möbel in dieser Richtung (das nächstgelegene)
    const conflicts = others
      .filter((o) => o.overlaps && overlapDirection(center, centerOf(o.polygon)) === direction)
      .sort((a, b) => Math.hypot(centerOf(a.polygon).x - center.x, centerOf(a.polygon).z - center.z) - Math.hypot(centerOf(b.polygon).x - center.x, centerOf(b.polygon).z - center.z));
    if (conflicts.length > 0) {
      const other = conflicts[0];
      return {
        direction, distance: 0, conflict: true, from: center, to: centerOf(other.polygon),
        target: { kind: 'furniture', id: other.item.id, name: other.item.name },
      };
    }

    let best: { distance: number; contacts: FloorPoint[]; target: ClearanceTarget } = { ...wallGap(footprint, direction, room), target: { kind: 'wall' } };
    for (const other of others) {
      if (other.overlaps) continue;
      const hit = sweep(footprint, other.polygon, d);
      if (hit && hit.distance < best.distance - TIE) {
        best = { ...hit, target: { kind: 'furniture', id: other.item.id, name: other.item.name } };
      }
    }
    for (const obstacle of obstacles) {
      if (polygonsOverlap(footprint, obstacle.polygon, COLLISION_CONFIG.touchTolerance)) continue;
      const hit = sweep(footprint, obstacle.polygon, d);
      if (hit && hit.distance < best.distance - TIE) best = { ...hit, target: obstacle.target };
    }
    const from = contactPoint(best.contacts, d);
    return { direction, distance: best.distance, conflict: false, from, to: offset(from, d, best.distance), target: best.target };
  });
}

/** Neue Position, damit der Abstand in `direction` genau `target` beträgt. */
export function positionForClearance(item: FurnitureItem, clearance: Clearance, target: Meters): FloorPoint {
  return offset(item.position, DIRECTION_VECTORS[clearance.direction], clearance.distance - target);
}
