import type { FurnitureItem } from '../../types/furniture';
import type { FloorPoint } from '../../types/room';
import { clamp, roundToPrecision } from '../units';
import { add, convexHull, convexPenetration, distance, pointInPolygon, scale, sub } from '../polygon';
import type { RoomModel } from './model';

/**
 * Möbel innerhalb der tatsächlichen Raumkontur (auch L-Formen, schräge Wände).
 *
 * Idee: Der Mittelpunkt c einer Grundfläche R ist genau dann zulässig, wenn c im
 * Raumumriss liegt und R keine Wand schneidet. „R schneidet Wand e“ ⇔ c liegt in
 * e ⊕ R (Minkowski-Summe aus Strecke und Rechteck = konvexes Polygon). Die
 * zulässige Menge ist also Umriss minus einige konvexe Sperrflächen – damit lassen
 * sich Gültigkeit und der nächste zulässige Punkt exakt und schnell bestimmen.
 */

type Shape = Pick<FurnitureItem, 'width' | 'depth' | 'rotationDeg'>;

/** Toleranz: Berühren der Wand ist erlaubt. */
const STRICT = 1e-6;
/** Nach dem Runden auf ganze cm – falls kein cm-Punkt exakt passt (schräge Wände). */
const RELAXED = 0.006;

interface Blockers {
  polygon: FloorPoint[];
  hulls: FloorPoint[][];
  corners: FloorPoint[];
}

const blockerCache = new WeakMap<RoomModel, Map<string, Blockers>>();

/** Ecken der (gedrehten) Grundfläche relativ zum Mittelpunkt – wie `rectanglePolygon`. */
export function footprintOffsets({ width, depth, rotationDeg }: Shape): FloorPoint[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const ax = { x: Math.cos(rad), z: Math.sin(rad) };
  const az = { x: -Math.sin(rad), z: Math.cos(rad) };
  const hw = width / 2;
  const hd = depth / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => ({ x: ax.x * hw * sx + az.x * hd * sz, z: ax.z * hw * sx + az.z * hd * sz }));
}

function blockersFor(room: RoomModel, shape: Shape): Blockers {
  let byShape = blockerCache.get(room);
  if (!byShape) {
    byShape = new Map();
    blockerCache.set(room, byShape);
  }
  const key = `${shape.width}|${shape.depth}|${shape.rotationDeg}`;
  let blockers = byShape.get(key);
  if (!blockers) {
    const corners = footprintOffsets(shape);
    const polygon = room.polygon;
    const hulls = polygon.map((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return convexHull(corners.flatMap((c) => [add(a, c), add(b, c)]));
    });
    blockers = { polygon, hulls, corners };
    if (byShape.size > 64) byShape.clear();
    byShape.set(key, blockers);
  }
  return blockers;
}

function validWith(b: Blockers, c: FloorPoint, tolerance: number): boolean {
  if (!pointInPolygon(c, b.polygon)) {
    // Auf dem Rand liegende Mittelpunkte (Möbel dünner als Toleranz) sind unkritisch; sonst außerhalb.
    return false;
  }
  for (const hull of b.hulls) if (convexPenetration(c, hull) > tolerance) return false;
  return true;
}

/** Liegt die Grundfläche an Position `c` (Grundriss) vollständig im Raum? */
export function fitsInRoom(room: RoomModel, shape: Shape, c: FloorPoint, relaxed = false): boolean {
  return validWith(blockersFor(room, shape), c, relaxed ? RELAXED : STRICT);
}

const ceilCm = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
const floorCm = (v: number) => Math.floor(v * 100 + 1e-6) / 100;

/** Auf ganze cm runden und dabei gültig bleiben (nächste gültige Rundung). */
function roundValid(b: Blockers, p: FloorPoint): FloorPoint | null {
  const xs = [roundToPrecision(p.x), floorCm(p.x), ceilCm(p.x)];
  const zs = [roundToPrecision(p.z), floorCm(p.z), ceilCm(p.z)];
  const options: FloorPoint[] = [];
  for (const x of xs) for (const z of zs) options.push({ x, z });
  options.sort((a, c) => distance(a, p) - distance(c, p));
  for (const o of options) if (validWith(b, o, STRICT)) return o;
  // Schräge Wände: Passt kein ganzer cm, bleibt der exakte (gültige) Punkt.
  return validWith(b, p, STRICT) ? p : null;
}

/** Halbe Ausdehnung der achsparallelen Hülle der gedrehten Grundfläche. */
function halfExtents(corners: readonly FloorPoint[]) {
  return { hx: Math.max(...corners.map((c) => Math.abs(c.x))), hz: Math.max(...corners.map((c) => Math.abs(c.z))) };
}

/**
 * Nächste zulässige Position zu `desired` (Grundriss, auf cm gerundet). Bei einem
 * Rechteckraum identisch zum bisherigen achsweisen Begrenzen. Passt das Möbel
 * nirgends hinein, wird es wie bisher achsweise begrenzt (bzw. mittig gesetzt).
 */
export function nearestPositionInRoom(room: RoomModel, shape: Shape, desired: FloorPoint): FloorPoint {
  const b = blockersFor(room, shape);
  const { hx, hz } = halfExtents(b.corners);
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const axisRange = (lo: number, hi: number, half: number) =>
    2 * half >= hi - lo ? { min: (lo + hi) / 2, max: (lo + hi) / 2 } : { min: ceilCm(lo + half), max: floorCm(hi - half) };
  const rx = axisRange(minX, maxX, hx);
  const rz = axisRange(minZ, maxZ, hz);
  const boxClamped = { x: roundToPrecision(clamp(desired.x, rx.min, rx.max)), z: roundToPrecision(clamp(desired.z, rz.min, rz.max)) };

  // 1. Schon zulässig (nach dem Runden)?
  if (validWith(b, desired, STRICT)) {
    const rounded = roundValid(b, desired);
    if (rounded) return rounded;
  }
  // 2. Achsweise in die Hülle begrenzen – bei Rechtecken bereits das Ergebnis.
  if (validWith(b, boxClamped, STRICT)) return boxClamped;

  // 3. Allgemein: nächster Punkt auf den Rändern der Sperrflächen (Projektionen,
  //    Ecken und Schnittpunkte), der zulässig ist.
  const candidates: FloorPoint[] = [];
  const edges: [FloorPoint, FloorPoint][] = [];
  for (const hull of b.hulls) {
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i];
      const q = hull[(i + 1) % hull.length];
      edges.push([p, q]);
      candidates.push(p);
      const e = sub(q, p);
      const len2 = e.x * e.x + e.z * e.z;
      if (len2 > 1e-12) {
        const t = clamp(((desired.x - p.x) * e.x + (desired.z - p.z) * e.z) / len2, 0, 1);
        candidates.push(add(p, scale(e, t)));
      }
    }
  }
  // Polygonecken (schmale Möbel passen ggf. nur dort hinein).
  for (let i = 0; i < edges.length; i++) {
    const [p, q] = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const [r, s] = edges[j];
      const hit = segmentIntersection(p, q, r, s);
      if (hit) candidates.push(hit);
    }
  }
  candidates.sort((a, c) => distance(a, desired) - distance(c, desired));
  for (const c of candidates) {
    if (!validWith(b, c, 1e-7)) continue;
    const rounded = roundValid(b, c);
    if (rounded) return rounded;
  }
  // 4. Passt nirgends: wie bisher achsweise begrenzen.
  return boxClamped;
}

function segmentIntersection(p: FloorPoint, q: FloorPoint, r: FloorPoint, s: FloorPoint): FloorPoint | null {
  const d1 = sub(q, p);
  const d2 = sub(s, r);
  const denom = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(denom) < 1e-12) return null;
  const w = sub(r, p);
  const t = (w.x * d2.z - w.z * d2.x) / denom;
  const u = (w.x * d1.z - w.z * d1.x) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return add(p, scale(d1, t));
}

/**
 * Größte Verschiebung (ganze cm) entlang `delta` ab `start`, bei der alle Grundflächen
 * im Raum bleiben – „schieben bis zur Wand“. Möbel, die schon vorher nicht passten,
 * blockieren nicht.
 */
export function maxFormationStep(
  room: RoomModel,
  items: readonly Pick<FurnitureItem, 'width' | 'depth' | 'rotationDeg' | 'position'>[],
  start: FloorPoint,
  delta: FloorPoint,
): number {
  const steps = Math.round(Math.max(Math.abs(delta.x), Math.abs(delta.z)) * 100);
  if (steps === 0) return 0;
  const active = items
    .map((item) => ({ item, b: blockersFor(room, item) }))
    .filter(({ item, b }) => validWith(b, add(item.position, start), RELAXED));
  const ok = (k: number) => {
    const d = add(start, scale(delta, k / steps));
    const shift = { x: roundToPrecision(d.x), z: roundToPrecision(d.z) };
    return active.every(({ item, b }) => validWith(b, add(item.position, shift), STRICT));
  };
  let best = 0;
  // Grob (10 cm), dann fein – bricht am ersten Hindernis ab.
  const coarse = 10;
  let k = coarse;
  while (k <= steps && ok(k)) {
    best = k;
    k += coarse;
  }
  for (let f = best + 1; f <= Math.min(steps, best + coarse); f++) {
    if (!ok(f)) break;
    best = f;
  }
  return best / steps;
}
