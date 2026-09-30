import type { FloorPoint, Meters, RoomDimensions, RoomPlan, WallSegment, WallSide } from '../../types/room';
import { add, boundsOf, dot, length, lineIntersection, normalize, scale, sub, type Bounds } from '../polygon';

/**
 * Abgeleitetes Raummodell: alles, was Darstellung, Kollision, Möbel- und
 * Öffnungslogik aus dem gespeicherten Wandumriss brauchen. Wird je Raumstand
 * einmal berechnet (WeakMap-Cache) und ist unveränderlich.
 */
export interface RoomModel {
  plan: RoomPlan;
  walls: WallSegment[];
  wallById: ReadonlyMap<string, WallSegment>;
  /** Innenumriss in Grundriss- bzw. Weltkoordinaten (Ecken = Wandanfänge). */
  polygon: FloorPoint[];
  worldPolygon: FloorPoint[];
  /** Hülle des Innenumrisses (Grundriss). Nach der Normalisierung beginnt sie bei 0/0. */
  bounds: Bounds;
  /** Außenumriss (Gehrungspunkte, Welt) und seine Hülle – für Kamera und Einpassen. */
  outerPolygon: FloorPoint[];
  outerBounds: Bounds;
  /** Lichte Hüllmaße und Raumhöhe. */
  dimensions: RoomDimensions;
  /** Achsparalleles Rechteck (vier Ecken, rechte Winkel). */
  isRectangle: boolean;
  origin: FloorPoint;
}

const CARDINAL: readonly { side: WallSide; normal: FloorPoint; word: string; name: string }[] = [
  { side: 'north', normal: { x: 0, z: -1 }, word: 'oben', name: 'Nord' },
  { side: 'east', normal: { x: 1, z: 0 }, word: 'rechts', name: 'Ost' },
  { side: 'south', normal: { x: 0, z: 1 }, word: 'unten', name: 'Süd' },
  { side: 'west', normal: { x: -1, z: 0 }, word: 'links', name: 'West' },
];

/** Ab dieser Abweichung (cos) gilt eine Wand nicht mehr als achsparallel. */
const AXIS_ALIGNED_COS = 0.999;

export const toWorld = (p: FloorPoint, origin: FloorPoint): FloorPoint => ({ x: p.x - origin.x, z: p.z - origin.z });
export const toPlan = (p: FloorPoint, origin: FloorPoint): FloorPoint => ({ x: p.x + origin.x, z: p.z + origin.z });

const cache = new WeakMap<RoomPlan, RoomModel>();

/** Raummodell zu einem Raumstand (gecacht). */
export function roomModelOf(plan: RoomPlan): RoomModel {
  let model = cache.get(plan);
  if (!model) {
    model = buildRoomModel(plan);
    cache.set(plan, model);
  }
  return model;
}

function facingOf(outward: FloorPoint): (typeof CARDINAL)[number] | null {
  for (const c of CARDINAL) if (dot(outward, c.normal) >= AXIS_ALIGNED_COS) return c;
  return null;
}

/** Anzeigename einer Wand: klassische Rechteckwände behalten „Nord (oben)“ usw. */
export function wallLabel(id: string, index: number, facing: (typeof CARDINAL)[number] | null): string {
  if (facing && id === facing.side) return `${facing.name} (${facing.word})`;
  return `Wand ${index + 1} (${facing ? facing.word : 'schräg'})`;
}

function buildRoomModel(plan: RoomPlan): RoomModel {
  const { origin } = plan;
  const n = plan.walls.length;
  const basics = plan.walls.map((wall) => {
    const d = sub(wall.end, wall.start);
    const axis = normalize(d);
    const inward = { x: -axis.z, z: axis.x };
    return { wall, axis, inward, outward: scale(inward, -1), length: length(d) };
  });

  const walls: WallSegment[] = basics.map((b, i) => {
    const prev = basics[(i - 1 + n) % n];
    const next = basics[(i + 1) % n];
    const { wall, axis, inward, outward } = b;
    // Gehrung: Schnitt der Außenlinien benachbarter Wände (parallel → gerader Abschluss).
    const outerLine = add(wall.start, scale(outward, wall.thickness));
    const prevOuter = add(prev.wall.start, scale(prev.outward, prev.wall.thickness));
    const nextOuter = add(next.wall.start, scale(next.outward, next.wall.thickness));
    const startMiter = lineIntersection(outerLine, axis, prevOuter, prev.axis);
    const endMiter = lineIntersection(outerLine, axis, nextOuter, next.axis);
    const outerStart = startMiter ? dot(sub(startMiter, wall.start), axis) : 0;
    const outerEnd = endMiter ? dot(sub(endMiter, wall.start), axis) : b.length;

    const start = toWorld(wall.start, origin);
    const end = toWorld(wall.end, origin);
    const mid = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
    const facing = facingOf(outward);
    const horizontal = Math.abs(axis.x) >= Math.abs(axis.z);
    return {
      id: wall.id,
      index: i,
      start,
      end,
      planStart: wall.start,
      planEnd: wall.end,
      length: b.length,
      axis,
      inward,
      thickness: wall.thickness,
      height: wall.height,
      outerStart,
      outerEnd,
      center: add(mid, scale(inward, -wall.thickness / 2)),
      rotationY: Math.atan2(-axis.z, axis.x),
      readingReversed: horizontal ? axis.x < 0 : axis.z < 0,
      horizontal,
      facing: facing?.side ?? null,
      label: wallLabel(wall.id, i, facing),
    };
  });

  const polygon = plan.walls.map((w) => w.start);
  const worldPolygon = polygon.map((p) => toWorld(p, origin));
  const bounds = boundsOf(polygon);
  const outerPolygon = walls.map((w) => add(add(w.start, scale(w.axis, w.outerStart)), scale(w.inward, -w.thickness)));
  const isRectangle =
    n === 4 && walls.every((w) => w.facing !== null) && new Set(walls.map((w) => w.facing)).size === 4;

  return {
    plan,
    walls,
    wallById: new Map(walls.map((w) => [w.id, w])),
    polygon,
    worldPolygon,
    bounds,
    outerPolygon,
    outerBounds: boundsOf([...outerPolygon, ...worldPolygon]),
    dimensions: { width: bounds.maxX - bounds.minX, length: bounds.maxZ - bounds.minZ, height: plan.height },
    isRectangle,
    origin,
  };
}

/** Punkt auf der Wand-Innenfläche (Welt): `along` ab Wandanfang, `into` Richtung Raum. */
export function wallPoint(wall: WallSegment, along: Meters, into: Meters): FloorPoint {
  return {
    x: wall.start.x + wall.axis.x * along + wall.inward.x * into,
    z: wall.start.z + wall.axis.z * along + wall.inward.z * into,
  };
}

/**
 * Umrechnung zwischen gespeicherter Position (ab Wandanfang) und angezeigter Position
 * („von links“ bzw. „von oben“ im Grundriss) – beide bis zur jeweils näheren Kante.
 */
export function readingOffset(wall: WallSegment, offset: Meters, width: Meters): Meters {
  return wall.readingReversed ? wall.length - offset - width : offset;
}
export const offsetFromReading = readingOffset;

/** Beschriftung des Positionsfelds eines wandgebundenen Elements. */
export const readingLabel = (wall: WallSegment) => (wall.horizontal ? 'Abstand von links' : 'Abstand von oben');
