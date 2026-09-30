import { FURNITURE_DRAG_CONFIG } from '../config/furniture';
import type { FurnitureItem } from '../types/furniture';
import type { FloorPoint } from '../types/room';
import { getFootprintHalfExtents, getFurnitureLimits, normalizeRotation } from './furniture';
import { nearestPositionInRoom } from './room/containment';
import type { RoomModel } from './room/model';
import { clamp, roundToPrecision } from './units';

export type FurnitureSnapKind = 'wall' | 'center' | 'furniture';

/** Einrastlinie im Grundriss: bei `axis: 'x'` eine senkrechte Linie bei x = `at`. */
export interface FurnitureSnapGuide {
  axis: 'x' | 'z';
  at: number;
  kind: FurnitureSnapKind;
}

export interface FurnitureMoveResult {
  position: FloorPoint;
  guides: FurnitureSnapGuide[];
}

interface Candidate {
  center: number;
  guideAt: number;
  kind: FurnitureSnapKind;
}

/** Achsparallele Wände: Lage (x bzw. z) und ob der Raum auf der größeren Seite liegt. */
function axisWalls(room: RoomModel, axis: 'x' | 'z') {
  const result: { at: number; roomAfter: boolean }[] = [];
  for (const wall of room.walls) {
    // Senkrechte Wand (x = konst.) begrenzt die x-Achse, waagerechte die z-Achse.
    const normalComponent = axis === 'x' ? wall.inward.x : wall.inward.z;
    if (Math.abs(normalComponent) < 0.999) continue;
    result.push({ at: axis === 'x' ? wall.planStart.x : wall.planStart.z, roomAfter: normalComponent > 0 });
  }
  return result;
}

/** Einrastkandidaten für den Mittelpunkt entlang einer Achse. */
function axisCandidates(
  axis: 'x' | 'z',
  half: number,
  room: RoomModel,
  others: readonly FurnitureItem[],
): Candidate[] {
  const lo = axis === 'x' ? room.bounds.minX : room.bounds.minZ;
  const hi = axis === 'x' ? room.bounds.maxX : room.bounds.maxZ;
  const ceilCm = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
  const floorCm = (v: number) => Math.floor(v * 100 + 1e-6) / 100;
  const candidates: Candidate[] = [
    // Innenwände (achsparallel): Grundriss liegt an der Wand an.
    ...axisWalls(room, axis).map(({ at, roomAfter }): Candidate =>
      roomAfter ? { center: ceilCm(at + half), guideAt: at, kind: 'wall' } : { center: floorCm(at - half), guideAt: at, kind: 'wall' },
    ),
    // Raummitte (Mitte der Umriss-Hülle)
    { center: (lo + hi) / 2, guideAt: (lo + hi) / 2, kind: 'center' },
  ];
  for (const other of others) {
    const oh = getFootprintHalfExtents(other);
    const oc = other.position[axis];
    const oHalf = axis === 'x' ? oh.hx : oh.hz;
    const o0 = oc - oHalf;
    const o1 = oc + oHalf;
    candidates.push(
      { center: o1 + half, guideAt: o1, kind: 'furniture' }, // Kante an Kante (rechts/unten daneben)
      { center: o0 - half, guideAt: o0, kind: 'furniture' }, // Kante an Kante (links/oben daneben)
      { center: o0 + half, guideAt: o0, kind: 'furniture' }, // bündig mit Anfangskante
      { center: o1 - half, guideAt: o1, kind: 'furniture' }, // bündig mit Endkante
      { center: oc, guideAt: oc, kind: 'furniture' }, // Mitten fluchten
    );
  }
  return candidates;
}

/**
 * Neue Position beim Verschieben: gewünschter Mittelpunkt → leichtes Einrasten
 * (je Achse unabhängig, nur innerhalb weniger Bildschirmpixel) → nächste zulässige
 * Position in der tatsächlichen Raumkontur (Größe und Drehung) → Rundung auf 1 cm.
 */
export function computeFurnitureMove(
  item: FurnitureItem,
  desired: FloorPoint,
  all: readonly FurnitureItem[],
  room: RoomModel,
  metersPerPixel: number,
): FurnitureMoveResult {
  const limits = getFurnitureLimits(item, room);
  const { hx, hz } = getFootprintHalfExtents(item);
  const others = all.filter((f) => f.id !== item.id);
  const snapDistance = FURNITURE_DRAG_CONFIG.snapDistancePx * metersPerPixel;
  const guides: FurnitureSnapGuide[] = [];

  const solve = (axis: 'x' | 'z', half: number): { value: number; guide: FurnitureSnapGuide | null } => {
    const range = limits[axis];
    const raw = desired[axis];
    let best: Candidate | null = null;
    for (const c of axisCandidates(axis, half, room, others)) {
      if (c.center < range.min - 1e-9 || c.center > range.max + 1e-9) continue;
      const delta = Math.abs(c.center - raw);
      if (delta <= snapDistance && (!best || delta < Math.abs(best.center - raw))) best = c;
    }
    return {
      value: roundToPrecision(clamp(best ? best.center : raw, range.min, range.max)),
      guide: best ? { axis, at: best.guideAt, kind: best.kind } : null,
    };
  };

  const sx = solve('x', hx);
  const sz = solve('z', hz);
  const position = nearestPositionInRoom(room, item, { x: sx.value, z: sz.value });
  // Hilfslinien nur zeigen, wenn die Position auf dieser Achse wirklich eingerastet blieb.
  if (sx.guide && Math.abs(position.x - sx.value) < 1e-9) guides.push(sx.guide);
  if (sz.guide && Math.abs(position.z - sz.value) < 1e-9) guides.push(sz.guide);
  return { position, guides };
}

/** Winkel eines Punkts um einen Mittelpunkt, im Grundriss im Uhrzeigersinn ab Norden (Grad). */
export function planAngleDeg(center: FloorPoint, point: FloorPoint): number {
  return (Math.atan2(point.x - center.x, -(point.z - center.z)) * 180) / Math.PI;
}

/**
 * Rotation beim Ziehen des Handles: Standardraster (5°), in der Nähe von
 * 0°/90°/180°/270° stärkeres Einrasten.
 */
export function snapRotation(rawDeg: number): number {
  const { rotationStepDeg, rotationCardinalSnapDeg } = FURNITURE_DRAG_CONFIG;
  const deg = ((rawDeg % 360) + 360) % 360;
  const cardinal = Math.round(deg / 90) * 90;
  if (Math.abs(deg - cardinal) <= rotationCardinalSnapDeg) return normalizeRotation(cardinal);
  return normalizeRotation(Math.round(deg / rotationStepDeg) * rotationStepDeg);
}
