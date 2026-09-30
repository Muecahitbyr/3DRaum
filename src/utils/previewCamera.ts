import { ShapeUtils, Vector2 } from 'three';
import type { FloorPoint } from '../types/room';
import { closestOnSegment, pointInPolygon, signedArea } from './polygon';
import type { RoomModel } from './room/model';

/** Abstand, den die Vorschaukamera zu den Wänden hält, und Höhengrenzen. */
export const PREVIEW_CAMERA = { wallMargin: 0.3, eyeHeight: 1.6, targetHeight: 1.15, minY: 0.35, ceilingGap: 0.15 } as const;

/** Punkt sicher im Raum (Welt): Flächenschwerpunkt oder – bei konkaven Formen – größtes Teildreieck. */
export function interiorPoint(room: RoomModel): FloorPoint {
  const poly = room.worldPolygon;
  const area = signedArea(poly);
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const f = a.x * b.z - b.x * a.z;
    cx += (a.x + b.x) * f;
    cz += (a.z + b.z) * f;
  }
  const centroid = { x: cx / (6 * area), z: cz / (6 * area) };
  if (Number.isFinite(centroid.x) && pointInPolygon(centroid, poly)) return centroid;
  const triangles = ShapeUtils.triangulateShape(poly.map((p) => new Vector2(p.x, p.z)), []);
  let best: FloorPoint = poly[0];
  let bestArea = -1;
  for (const [i, j, k] of triangles) {
    const t = Math.abs(signedArea([poly[i], poly[j], poly[k]]));
    if (t > bestArea) {
      bestArea = t;
      best = { x: (poly[i].x + poly[j].x + poly[k].x) / 3, z: (poly[i].z + poly[j].z + poly[k].z) / 3 };
    }
  }
  return best;
}

/**
 * Hält einen Punkt (Welt, x/z) im Raum mit Mindestabstand zu den Wänden – so kann
 * die Vorschaukamera nie durch eine Wand fliegen. Liefert `null`, wenn nichts zu tun ist.
 */
export function keepInside(room: RoomModel, p: FloorPoint, margin: number, depth = 0): FloorPoint | null {
  const inside = pointInPolygon(p, room.worldPolygon);
  let nearest: { point: FloorPoint; distance: number; inward: FloorPoint } | null = null;
  for (const wall of room.walls) {
    const hit = closestOnSegment(p, wall.start, wall.end);
    if (!nearest || hit.distance < nearest.distance) nearest = { point: hit.point, distance: hit.distance, inward: wall.inward };
  }
  if (!nearest) return null;
  if (inside && nearest.distance >= margin) return null;
  const pushed = { x: nearest.point.x + nearest.inward.x * margin, z: nearest.point.z + nearest.inward.z * margin };
  // In engen Ecken ggf. mehrfach korrigieren.
  if (!pointInPolygon(pushed, room.worldPolygon)) return interiorPoint(room);
  if (depth >= 3) return pushed;
  const again = keepInside(room, pushed, margin * 0.999, depth + 1);
  return again ?? pushed;
}

/**
 * Startansicht der Vorschau: auf Augenhöhe in der Nähe einer Raumecke mit dem
 * weitesten Blick (diagonal durch den Raum), Blick zur Raummitte – so ist möglichst
 * viel vom Raum zu sehen.
 */
export function previewPose(room: RoomModel, obstacles: readonly (readonly FloorPoint[])[] = []) {
  const target = interiorPoint(room);
  // Freie Strecke bis zur Wand bzw. bis zu einem hohen Möbel (Schrank, Regal …).
  const reach = (direction: FloorPoint) => {
    let distance = 0;
    for (let d = 0.1; d < 40; d += 0.1) {
      const q = { x: target.x + direction.x * d, z: target.z + direction.z * d };
      if (!pointInPolygon(q, room.worldPolygon)) break;
      if (d > 0.6 && obstacles.some((o) => pointInPolygon(q, o))) break;
      distance = d;
    }
    return distance;
  };
  // Vorzugsweise von vorne rechts (wie die Bearbeitungskamera), sonst die freieste Richtung.
  const candidates = [
    { x: 0.6, z: 0.8 }, { x: -0.6, z: 0.8 }, { x: 0.6, z: -0.8 }, { x: -0.6, z: -0.8 },
    { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
  ];
  let direction = candidates[0];
  let distance = reach(direction);
  for (const c of candidates.slice(1)) {
    const d = reach(c);
    if (d > distance * 1.25) {
      direction = c;
      distance = d;
    }
  }
  const along = Math.max(0.6, distance - PREVIEW_CAMERA.wallMargin - 0.2);
  const raw = { x: target.x + direction.x * along, z: target.z + direction.z * along };
  const position = keepInside(room, raw, PREVIEW_CAMERA.wallMargin) ?? raw;
  const H = room.dimensions.height;
  return {
    position: [position.x, Math.min(PREVIEW_CAMERA.eyeHeight, H - PREVIEW_CAMERA.ceilingGap - 0.2), position.z] as [number, number, number],
    target: [target.x, Math.min(PREVIEW_CAMERA.targetHeight, H * 0.5), target.z] as [number, number, number],
  };
}
