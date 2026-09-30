import type { FloorPoint } from '../types/room';
import type { HeightRange, Polygon } from './types';

/** Gedrehtes Rechteck; Drehung im Grundriss im Uhrzeigersinn (wie bei Möbeln). */
export function rectanglePolygon(
  center: FloorPoint,
  halfWidth: number,
  halfDepth: number,
  rotationDeg: number,
): Polygon {
  const rad = (rotationDeg * Math.PI) / 180;
  // Lokale x-Achse → (cos, sin), lokale z-Achse → (−sin, cos) in Welt-x/z.
  const ax = { x: Math.cos(rad), z: Math.sin(rad) };
  const az = { x: -Math.sin(rad), z: Math.cos(rad) };
  const corner = (sx: number, sz: number) => ({
    x: center.x + ax.x * halfWidth * sx + az.x * halfDepth * sz,
    z: center.z + ax.z * halfWidth * sx + az.z * halfDepth * sz,
  });
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

/**
 * Viertelkreis-Sektor (konvex) um `center` vom Einheitsvektor `from` zum dazu
 * senkrechten Einheitsvektor `to`, angenähert durch `segments` Sehnen.
 */
export function quarterSectorPolygon(
  center: FloorPoint,
  radius: number,
  from: FloorPoint,
  to: FloorPoint,
  segments: number,
): Polygon {
  const points: FloorPoint[] = [center];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    points.push({
      x: center.x + radius * (Math.cos(t) * from.x + Math.sin(t) * to.x),
      z: center.z + radius * (Math.cos(t) * from.z + Math.sin(t) * to.z),
    });
  }
  return points;
}

function project(polygon: Polygon, axis: FloorPoint): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of polygon) {
    const v = p.x * axis.x + p.z * axis.z;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

function edgeNormals(polygon: Polygon): FloorPoint[] {
  const normals: FloorPoint[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > 1e-9) normals.push({ x: -(b.z - a.z) / length, z: (b.x - a.x) / length });
  }
  return normals;
}

/**
 * Separating Axis Theorem für konvexe Polygone – exakt auch bei gedrehten
 * Formen. Überschneidung nur, wenn die Eindringtiefe auf jeder Achse größer als
 * `tolerance` ist; nur berührende Kanten gelten damit nicht als Kollision.
 */
export function polygonsOverlap(a: Polygon, b: Polygon, tolerance: number): boolean {
  for (const axis of [...edgeNormals(a), ...edgeNormals(b)]) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= tolerance) return false;
  }
  return true;
}

export function heightRangesOverlap(a: HeightRange, b: HeightRange, tolerance: number): boolean {
  return Math.min(a.max, b.max) - Math.max(a.min, b.min) > tolerance;
}
