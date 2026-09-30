import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Meters } from '../types/room';

const EPSILON = 1e-6;

/** Rechteckige Aussparung im lokalen Wand-Koordinatensystem (x entlang, y hoch). */
export interface WallCutout {
  x0: Meters;
  x1: Meters;
  y0: Meters;
  y1: Meters;
}

/** Gehrung: Lage der Außenfläche entlang der Wand relativ zum Innen-Anfang (0 … Länge = rechtwinklig). */
export interface WallMiter {
  outerStart: Meters;
  outerEnd: Meters;
}

type Vec3 = [number, number, number];

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > EPSILON);
}

/**
 * Erzeugt eine Wand mit echten, durchgehenden Öffnungen und Gehrung an den Enden.
 *
 * Grundfläche: Viereck aus Innenfläche (z = +D/2, x ∈ [−L/2, L/2]) und Außenfläche
 * (z = −D/2, Lage laut Gehrung). Die Wand wird an allen Eck- und Aussparungskanten
 * in ein Raster aus x-Streifen (Trapez-Querschnitt) und Höhenabschnitten zerlegt.
 * Zellen in Aussparungen entfallen; jede übrige Zelle erhält ihre Innen-/Außen- bzw.
 * Gehrungsfläche und – zu leeren Nachbarn oder zum Rand – Seiten-, Ober- und
 * Unterflächen. Weil alle Flächen dasselbe Raster teilen, gibt es keine T-Kreuzungen:
 * EdgesGeometry zeichnet nur echte Kanten.
 *
 * Koordinaten: x entlang der Wand (Innenfläche von −L/2 bis L/2), y ∈ [0, H], z ∈ [−D/2, D/2].
 */
export function buildWallGeometry(
  length: Meters,
  height: Meters,
  thickness: Meters,
  cutouts: readonly WallCutout[],
  miter: WallMiter = { outerStart: 0, outerEnd: length },
): BufferGeometry {
  const halfL = length / 2;
  const halfT = thickness / 2;
  // Grundfläche (x, z): innen a0→a1 bei +halfT, außen b0→b1 bei −halfT.
  const a0 = -halfL;
  const a1 = halfL;
  const b0 = miter.outerStart - halfL;
  const b1 = miter.outerEnd - halfL;
  const quad: [number, number][] = [
    [a0, halfT],
    [a1, halfT],
    [b1, -halfT],
    [b0, -halfT],
  ];
  const minX = Math.min(a0, b0);
  const maxX = Math.max(a1, b1);

  /** Querschnitt [lo, hi] (z) der Grundfläche an Stelle x. */
  const section = (x: number): [number, number] => {
    const zs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = quad[i];
      const [x1, z1] = quad[(i + 1) % 4];
      if (Math.abs(x1 - x0) < EPSILON) {
        if (Math.abs(x - x0) < EPSILON) zs.push(z0, z1);
        continue;
      }
      const t = (x - x0) / (x1 - x0);
      if (t >= -EPSILON && t <= 1 + EPSILON) zs.push(z0 + (z1 - z0) * t);
    }
    return zs.length ? [Math.min(...zs), Math.max(...zs)] : [0, 0];
  };

  const clipped = cutouts
    .map((c) => ({ x0: Math.max(c.x0, minX), x1: Math.min(c.x1, maxX), y0: Math.max(c.y0, 0), y1: Math.min(c.y1, height) }))
    .filter((c) => c.x1 - c.x0 > EPSILON && c.y1 - c.y0 > EPSILON);

  const xs = uniqueSorted([a0, a1, b0, b1, ...clipped.flatMap((c) => [c.x0, c.x1])]);
  const ys = uniqueSorted([0, height, ...clipped.flatMap((c) => [c.y0, c.y1])]);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const sections = xs.map(section);

  const solidGrid: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const [lo, hi] = section(cx);
    solidGrid.push(
      Array.from({ length: ny }, (_, j) => {
        const cy = (ys[j] + ys[j + 1]) / 2;
        return hi - lo > EPSILON && !clipped.some((c) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1);
      }),
    );
  }
  const isSolid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && solidGrid[i][j];

  const positions: number[] = [];
  const normals: number[] = [];
  // UV in Metern (Planarprojektion je Fläche) – für Wandoberflächen wie Feinputz/Beton.
  const uvs: number[] = [];
  const uvOf = (p: Vec3, n: Vec3): [number, number] => {
    if (Math.abs(n[1]) > 0.9) return [p[0], p[2]];
    if (Math.abs(n[0]) > 0.99) return [p[2], p[1]];
    return [p[0], p[1]];
  };

  /** Fügt ein Vieleck (3–4 Punkte, eben) hinzu; Wicklung passend zur Normalen, entartete Punkte entfallen. */
  const face = (points: Vec3[], n: Vec3) => {
    const pts = points.filter(
      (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1], p[2] - points[i - 1][2]) > EPSILON,
    );
    if (pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1], pts[0][2] - pts.at(-1)![2]) <= EPSILON) pts.pop();
    if (pts.length < 3) return;
    const [a, b, c] = pts;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const ordered = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0 ? pts : [pts[0], ...pts.slice(1).reverse()];
    const triangles = ordered.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (const index of triangles) {
      positions.push(...ordered[index]);
      normals.push(...n);
      uvs.push(...uvOf(ordered[index], n));
    }
  };

  /** Normale einer Umrisskante (x/z) nach außen: `sign` +1 für die Innen-, −1 für die Außenseite. */
  const edgeNormal = (x0: number, z0: number, x1: number, z1: number, sign: 1 | -1): Vec3 => {
    const nx0 = -(z1 - z0);
    const nz0 = x1 - x0;
    const len = Math.hypot(nx0, nz0) || 1;
    const n: Vec3 = [nx0 / len, 0, nz0 / len];
    return n[2] * sign >= 0 ? n : [-n[0], 0, -n[2]];
  };

  for (let i = 0; i < nx; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    const [loA, hiA] = sections[i];
    const [loB, hiB] = sections[i + 1];
    for (let j = 0; j < ny; j++) {
      if (!isSolid(i, j)) continue;
      const y0 = ys[j];
      const y1 = ys[j + 1];

      // Innen- bzw. Außenseite (inkl. Gehrungsflächen)
      face([[xa, y0, hiA], [xb, y0, hiB], [xb, y1, hiB], [xa, y1, hiA]], edgeNormal(xa, hiA, xb, hiB, 1));
      face([[xa, y0, loA], [xb, y0, loB], [xb, y1, loB], [xa, y1, loA]], edgeNormal(xa, loA, xb, loB, -1));

      if (!isSolid(i - 1, j)) face([[xa, y0, loA], [xa, y0, hiA], [xa, y1, hiA], [xa, y1, loA]], [-1, 0, 0]);
      if (!isSolid(i + 1, j)) face([[xb, y0, loB], [xb, y0, hiB], [xb, y1, hiB], [xb, y1, loB]], [1, 0, 0]);
      if (!isSolid(i, j - 1)) face([[xa, y0, loA], [xb, y0, loB], [xb, y0, hiB], [xa, y0, hiA]], [0, -1, 0]);
      if (!isSolid(i, j + 1)) face([[xa, y1, loA], [xb, y1, loB], [xb, y1, hiB], [xa, y1, hiA]], [0, 1, 0]);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}
