import { OPENING_DEFAULTS, OPENING_LIMITS, OPENING_PREFERRED_WALLS } from '../config/openings';
import type { DoorHinge, Opening, OpeningType } from '../types/opening';
import type { Meters, WallSegment, WallSide } from '../types/room';
import type { RoomModel } from './room/model';
import { dot } from './polygon';
import { clamp, roundToPrecision } from './units';

const EPSILON = 1e-6;

/** Lichte Länge einer Wand (0, falls es sie nicht gibt). */
export function getWallLength(wallId: string, room: RoomModel): Meters {
  return room.wallById.get(wallId)?.length ?? 0;
}

const FACING_NORMALS: Record<WallSide, { x: number; z: number }> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
};

/**
 * Wände in bevorzugter Reihenfolge: je bevorzugter Himmelsrichtung die Wände,
 * deren Außenseite am ehesten in diese Richtung zeigt (längere zuerst), danach alle übrigen.
 * Bei Rechteckräumen entspricht das genau der bisherigen Nord/Ost/Süd/West-Reihenfolge.
 */
export function wallsByPreference(room: RoomModel, sides: readonly WallSide[]): WallSegment[] {
  const result: WallSegment[] = [];
  for (const side of sides) {
    const normal = FACING_NORMALS[side];
    const matching = room.walls
      .filter((w) => !result.includes(w) && dot({ x: -w.inward.x, z: -w.inward.z }, normal) > 0.7)
      .sort((a, b) => b.length - a.length);
    result.push(...matching);
  }
  result.push(...room.walls.filter((w) => !result.includes(w)));
  return result;
}

export interface FieldLimits {
  min: Meters;
  max: Meters;
}

export interface OpeningLimits {
  offset: FieldLimits;
  width: FieldLimits;
  height: FieldLimits;
  /** Nur für Fenster. */
  sillHeight?: FieldLimits;
}

/**
 * Zulässige Wertebereiche eines (bereits normalisierten) Elements. Wird sowohl von
 * der Sidebar (Eingabegrenzen) als auch von `normalizeOpening` verwendet.
 */
export function getOpeningLimits(opening: Opening, room: RoomModel): OpeningLimits {
  const wallLength = getWallLength(opening.wall, room);
  const wallHeight = room.dimensions.height;
  const limits = OPENING_LIMITS[opening.type];
  const width = limit(Math.min(limits.width[0], wallLength), Math.min(limits.width[1], wallLength));
  const offset = limit(0, wallLength - opening.width);

  if (opening.type === 'door') {
    return {
      offset,
      width,
      height: limit(Math.min(limits.height[0], wallHeight), Math.min(limits.height[1], wallHeight)),
    };
  }

  const heightMax = Math.min(limits.height[1], wallHeight - opening.sillHeight);
  return {
    offset,
    width,
    height: limit(Math.min(limits.height[0], heightMax), heightMax),
    sillHeight: limit(0, wallHeight - opening.height),
  };
}

const fit = (value: Meters, { min, max }: FieldLimits) => roundToPrecision(clamp(value, min, max));

/** Grenzen auf die interne Genauigkeit runden (vermeidet z. B. 2 − 1,1 = 0,8999…). */
const limit = (min: Meters, max: Meters): FieldLimits => ({
  min: roundToPrecision(min),
  // Nach unten auf ganze cm: Auf schrägen Wänden (krumme Längen) ragt nichts über das Wandende.
  max: Math.max(roundToPrecision(min), floorCm(max)),
});

const floorCm = (v: Meters) => Math.floor(v * 100 + 1e-6) / 100;

/**
 * Begrenzt ein Element so, dass es vollständig innerhalb seiner Wand liegt
 * (Länge und Höhe). Reihenfolge: Breite → Position, Brüstung → Höhe.
 */
export function normalizeOpening(opening: Opening, room: RoomModel): Opening {
  const wallLength = getWallLength(opening.wall, room);
  const wallHeight = room.dimensions.height;
  const limits = OPENING_LIMITS[opening.type];

  const width = fit(opening.width, {
    min: Math.min(limits.width[0], wallLength),
    max: Math.min(limits.width[1], wallLength),
  });
  const offset = fit(opening.offset, { min: 0, max: floorCm(wallLength - width) });
  const minHeight = Math.min(limits.height[0], wallHeight);

  if (opening.type === 'door') {
    const height = fit(opening.height, { min: minHeight, max: Math.min(limits.height[1], wallHeight) });
    return { ...opening, width, offset, height };
  }

  const sillHeight = fit(opening.sillHeight, { min: 0, max: wallHeight - minHeight });
  const height = fit(opening.height, {
    min: minHeight,
    max: Math.min(limits.height[1], wallHeight - sillHeight),
  });
  return { ...opening, width, offset, sillHeight, height };
}

/**
 * Sucht an einer Wand eine freie Position: bevorzugt mittig, sonst mittig in der
 * größten freien Lücke. `null`, wenn kein Platz ist.
 */
/** Wandgebundenes Element (Öffnung, Raumobjekt) – für Platzsuche und Einrasten. */
export interface WallSpanItem {
  id: string;
  wall: string;
  offset: Meters;
  width: Meters;
}

export function findFreeOffset(
  side: string,
  width: Meters,
  wallLength: Meters,
  openings: readonly WallSpanItem[],
): Meters | null {
  const occupied = openings
    .filter((o) => o.wall === side)
    .map((o) => [o.offset, o.offset + o.width] as const)
    .sort((a, b) => a[0] - b[0]);
  const isFree = (start: Meters) =>
    occupied.every(([a, b]) => start + width <= a + EPSILON || start >= b - EPSILON);

  const centered = roundToPrecision((wallLength - width) / 2);
  if (centered >= 0 && isFree(centered)) return centered;

  let best: { start: Meters; size: Meters } | null = null;
  let cursor = 0;
  for (const [a, b] of [...occupied, [wallLength, wallLength] as const]) {
    const size = a - cursor;
    if (size >= width && (!best || size > best.size)) best = { start: cursor, size };
    cursor = Math.max(cursor, b);
  }
  if (!best) return null;
  const candidate = Math.floor((best.start + (best.size - width) / 2) * 100) / 100;
  return isFree(candidate) ? candidate : null;
}

/**
 * Standard-Anschlag: an der im Grundriss linken bzw. oberen Türkante (bisheriges
 * Verhalten). Vom Raum aus gesehen ist das an Nord-/Ostwand „links“, an Süd-/Westwand „rechts“.
 */
export function defaultDoorHinge(wall: Pick<WallSegment, 'readingReversed'>): DoorHinge {
  return wall.readingReversed ? 'right' : 'left';
}

/** Erzeugt ein neues Element mit Standardmaßen an der ersten Wand mit freiem Platz. */
export function createOpening(
  type: OpeningType,
  id: string,
  existing: readonly Opening[],
  room: RoomModel,
): Opening {
  const { width, height, sillHeight } = OPENING_DEFAULTS[type];
  const walls = wallsByPreference(room, OPENING_PREFERRED_WALLS[type]);

  let wall = walls[0];
  let offset = (wall.length - width) / 2;
  for (const candidate of walls) {
    const free = findFreeOffset(candidate.id, width, candidate.length, existing);
    if (free !== null) {
      wall = candidate;
      offset = free;
      break;
    }
  }

  const base = { id, wall: wall.id, offset, width, height };
  const opening: Opening =
    type === 'door' ? { ...base, type, hinge: defaultDoorHinge(wall), swing: 'inward' } : { ...base, type, sillHeight, sashes: 1 };
  return normalizeOpening(opening, room);
}

/** Lage einer Öffnung im lokalen Wand-Koordinatensystem (siehe getWallTransform). */
export interface OpeningLocalSpan {
  x0: Meters;
  x1: Meters;
  y0: Meters;
  y1: Meters;
  /** Türanschlag (Bandseite). */
  hingeX: Meters;
  /** Gegenüberliegende Kante (Schließseite). */
  strikeX: Meters;
  /** Öffnungsrichtung im lokalen Wandsystem: +1 = ins Rauminnere (+z), −1 = nach außen. */
  swingSign: 1 | -1;
}

export function getOpeningLocalSpan(opening: Opening, wall: WallSegment): OpeningLocalSpan {
  const x0 = opening.offset - wall.length / 2;
  const x1 = x0 + opening.width;
  const y0 = opening.type === 'window' ? opening.sillHeight : 0;

  return {
    x0,
    x1,
    y0,
    y1: y0 + opening.height,
    // Lokales x läuft – vom Raum aus gesehen – von links nach rechts.
    hingeX: opening.type === 'door' && opening.hinge === 'right' ? x1 : x0,
    strikeX: opening.type === 'door' && opening.hinge === 'right' ? x0 : x1,
    swingSign: opening.type === 'door' && opening.swing === 'outward' ? -1 : 1,
  };
}
