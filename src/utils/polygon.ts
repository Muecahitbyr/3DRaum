import type { FloorPoint } from '../types/room';

/**
 * Kleine, abhängigkeitsfreie Polygon-Geometrie für den Grundriss (x/z-Ebene).
 * Bewusst ohne Bibliothek: Raumumrisse haben wenige Ecken; die Triangulation für
 * den Boden übernimmt Three.js (`ShapeUtils`).
 */

export const GEOMETRY_EPSILON = 1e-9;

export const sub = (a: FloorPoint, b: FloorPoint): FloorPoint => ({ x: a.x - b.x, z: a.z - b.z });
export const add = (a: FloorPoint, b: FloorPoint): FloorPoint => ({ x: a.x + b.x, z: a.z + b.z });
export const scale = (a: FloorPoint, s: number): FloorPoint => ({ x: a.x * s, z: a.z * s });
export const dot = (a: FloorPoint, b: FloorPoint) => a.x * b.x + a.z * b.z;
export const cross = (a: FloorPoint, b: FloorPoint) => a.x * b.z - a.z * b.x;
export const length = (a: FloorPoint) => Math.hypot(a.x, a.z);
export const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z);
export const samePoint = (a: FloorPoint, b: FloorPoint, eps = 1e-6) => Math.abs(a.x - b.x) <= eps && Math.abs(a.z - b.z) <= eps;
export const isFinitePoint = (p: FloorPoint) => Number.isFinite(p.x) && Number.isFinite(p.z);

export function normalize(a: FloorPoint): FloorPoint {
  const l = length(a);
  return l > GEOMETRY_EPSILON ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 };
}

/**
 * Vorzeichenbehaftete Fläche (Schnürsenkelformel). Positiv für die Umlaufrichtung
 * des Planers: im Grundriss (z nach unten) im Uhrzeigersinn, Rauminneres rechts der Laufrichtung.
 */
export function signedArea(polygon: readonly FloorPoint[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Fläche eines einfachen (nicht selbstüberschneidenden) Polygons, unabhängig von der Umlaufrichtung. */
export const polygonArea = (polygon: readonly FloorPoint[]): number => Math.abs(signedArea(polygon));

/** Umfang eines geschlossenen Polygons (Summe aller Kantenlängen inkl. Schlusskante). */
export function polygonPerimeter(polygon: readonly FloorPoint[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) sum += distance(polygon[i], polygon[(i + 1) % polygon.length]);
  return sum;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boundsOf(points: readonly FloorPoint[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Punkt im Polygon (Strahlverfahren). Punkte genau auf dem Rand sind nicht eindeutig. */
export function pointInPolygon(p: FloorPoint, polygon: readonly FloorPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Nächster Punkt auf der Strecke a–b und Parameter t ∈ [0, 1]. */
export function closestOnSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 > GEOMETRY_EPSILON ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2)) : 0;
  const point = add(a, scale(ab, t));
  return { point, t, distance: distance(p, point) };
}

/** Schnittpunkt zweier Geraden (Punkt + Richtung); `null` bei Parallelen. */
export function lineIntersection(p: FloorPoint, r: FloorPoint, q: FloorPoint, s: FloorPoint): FloorPoint | null {
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const t = cross(sub(q, p), s) / denom;
  return add(p, scale(r, t));
}

const orientation = (a: FloorPoint, b: FloorPoint, c: FloorPoint) => cross(sub(b, a), sub(c, a));

/** Echte oder berührende Überschneidung zweier Strecken (inkl. kollinearer Überlappung). */
export function segmentsIntersect(a: FloorPoint, b: FloorPoint, c: FloorPoint, d: FloorPoint, eps = 1e-9): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
  const onSegment = (p: FloorPoint, q: FloorPoint, r: FloorPoint) =>
    Math.min(p.x, q.x) - eps <= r.x && r.x <= Math.max(p.x, q.x) + eps && Math.min(p.z, q.z) - eps <= r.z && r.z <= Math.max(p.z, q.z) + eps;
  if (Math.abs(o1) <= eps && onSegment(a, b, c)) return true;
  if (Math.abs(o2) <= eps && onSegment(a, b, d)) return true;
  if (Math.abs(o3) <= eps && onSegment(c, d, a)) return true;
  if (Math.abs(o4) <= eps && onSegment(c, d, b)) return true;
  return false;
}

/**
 * Selbstüberschneidung eines geschlossenen Polygons: nicht benachbarte Kanten
 * dürfen sich nicht berühren; benachbarte Kanten dürfen nicht zurücklaufen.
 */
export function polygonSelfIntersects(polygon: readonly FloorPoint[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const c = polygon[j];
      const d = polygon[(j + 1) % n];
      if (adjacent) {
        // Gemeinsame Ecke: Die Kanten dürfen nicht übereinander zurücklaufen.
        const shared = j === i + 1 ? b : a;
        const u = normalize(sub(j === i + 1 ? a : b, shared));
        const v = normalize(sub(j === i + 1 ? d : c, shared));
        if (dot(u, v) > 1 - 1e-9) return true;
        continue;
      }
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Konvexe Hülle (Monotone Chain), gegen den Uhrzeigersinn im mathematischen Sinn (x, z). */
export function convexHull(points: readonly FloorPoint[]): FloorPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 2) return sorted;
  const lower: FloorPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && orientation(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper: FloorPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && orientation(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Wie tief liegt p im konvexen Polygon (Hülle aus `convexHull`)? Positiv = innen
 * (Abstand zur nächsten Kante), negativ = außen.
 */
export function convexPenetration(p: FloorPoint, hull: readonly FloorPoint[]): number {
  if (hull.length < 3) return -Infinity;
  let min = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const e = sub(b, a);
    const len = length(e);
    if (len < GEOMETRY_EPSILON) continue;
    // Hülle läuft mathematisch positiv → innen liegt links: cross(e, p − a) > 0.
    min = Math.min(min, cross(e, sub(p, a)) / len);
  }
  return min;
}

/** Innenwinkel an Ecke b (Grad) für die Umlaufrichtung des Planers (Rauminneres rechts). */
export function interiorAngleDeg(a: FloorPoint, b: FloorPoint, c: FloorPoint): number {
  const u = normalize(sub(a, b));
  const v = normalize(sub(c, b));
  // Winkel von v nach u, gemessen auf der Innenseite.
  let angle = (Math.atan2(cross(v, u), dot(v, u)) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}
