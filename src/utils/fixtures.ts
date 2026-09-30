import { FIXTURE_CATALOG } from '../config/fixtures';
import type { FixtureType, RoomFixture } from '../types/fixture';
import type { FloorPoint, WallSegment } from '../types/room';
import { findFreeOffset, getWallLength, wallsByPreference, type FieldLimits } from './openings';
import type { RoomModel } from './room/model';
import { clamp, roundToPrecision } from './units';

export interface FixtureLimits {
  offset: FieldLimits;
  width: FieldLimits | null;
  height: FieldLimits | null;
  depth: FieldLimits | null;
  elevation: FieldLimits;
}

const floorCm = (v: number) => Math.floor(v * 100 + 1e-6) / 100;
const range = (min: number, max: number): FieldLimits => ({ min: roundToPrecision(min), max: Math.max(roundToPrecision(min), floorCm(max)) });

/** Zulässige Werte: innerhalb der Wandlänge und unterhalb der Raumhöhe. */
export function getFixtureLimits(fixture: RoomFixture, room: RoomModel): FixtureLimits {
  const { limits } = FIXTURE_CATALOG[fixture.type];
  const dimensions = room.dimensions;
  const wallLength = getWallLength(fixture.wall, room);
  const sized = (r: [number, number] | null, cap = Infinity) => (r ? range(Math.min(r[0], cap), Math.min(r[1], cap)) : null);
  return {
    offset: range(0, wallLength - fixture.width),
    width: sized(limits.width, wallLength),
    height: sized(limits.height, dimensions.height),
    depth: sized(limits.depth),
    elevation: range(limits.elevation[0], Math.min(limits.elevation[1], dimensions.height - fixture.height)),
  };
}

const fit = (value: number, { min, max }: FieldLimits) => roundToPrecision(clamp(value, min, max));

/** Hält ein Raumobjekt innerhalb seiner Wand (Länge und Höhe); feste Größen bleiben fest. */
export function normalizeFixture(fixture: RoomFixture, room: RoomModel): RoomFixture {
  const { defaults } = FIXTURE_CATALOG[fixture.type];
  const pre = getFixtureLimits(fixture, room);
  const width = pre.width ? fit(fixture.width, pre.width) : defaults.width;
  const height = pre.height ? fit(fixture.height, pre.height) : defaults.height;
  const depth = pre.depth ? fit(fixture.depth, pre.depth) : defaults.depth;
  const sized = { ...fixture, width, height, depth };
  const limits = getFixtureLimits(sized, room);
  return { ...sized, offset: fit(fixture.offset, limits.offset), elevation: fit(fixture.elevation, limits.elevation) };
}

/** Neues Raumobjekt mit Standardmaßen an der ersten Wand mit freiem Platz. */
export function createFixture(type: FixtureType, id: string, existing: readonly RoomFixture[], room: RoomModel): RoomFixture {
  const { defaults, preferredWalls } = FIXTURE_CATALOG[type];
  const sameType = existing.filter((f) => f.type === type);
  const walls = wallsByPreference(room, preferredWalls);
  let wall = walls[0];
  let offset = (wall.length - defaults.width) / 2;
  for (const candidate of walls) {
    const free = findFreeOffset(candidate.id, defaults.width, candidate.length, sameType);
    if (free !== null) {
      wall = candidate;
      offset = free;
      break;
    }
  }
  return normalizeFixture({ id, type, wall: wall.id, offset, ...defaults }, room);
}

/** Anzeigename wie „Heizkörper 1“ (fortlaufend je Art). */
export function getFixtureDisplayName(fixture: RoomFixture, fixtures: readonly RoomFixture[]): string {
  const index = fixtures.filter((f) => f.type === fixture.type).findIndex((f) => f.id === fixture.id);
  return `${FIXTURE_CATALOG[fixture.type].label} ${index + 1}`;
}

/** Lage im lokalen Wandsystem (x entlang, y hoch, Objekt vor der Innenfläche bei z = Dicke/2). */
export function getFixtureLocalSpan(fixture: RoomFixture, wall: WallSegment) {
  const x0 = fixture.offset - wall.length / 2;
  return {
    x0,
    x1: x0 + fixture.width,
    y0: fixture.elevation,
    y1: fixture.elevation + fixture.height,
    z0: wall.thickness / 2,
    z1: wall.thickness / 2 + fixture.depth,
  };
}

export type FixtureLocalSpan = ReturnType<typeof getFixtureLocalSpan>;

/** Grundfläche eines Raumobjekts (Grundrisskoordinaten) – z. B. Heizkörper als Hindernis. */
export function fixtureFootprint(fixture: RoomFixture, room: RoomModel): FloorPoint[] | null {
  const wall = room.wallById.get(fixture.wall);
  if (!wall) return null;
  const at = (along: number, into: number): FloorPoint => ({
    x: wall.planStart.x + wall.axis.x * along + wall.inward.x * into,
    z: wall.planStart.z + wall.axis.z * along + wall.inward.z * into,
  });
  const a0 = fixture.offset;
  const a1 = fixture.offset + fixture.width;
  return [at(a0, 0), at(a1, 0), at(a1, fixture.depth), at(a0, fixture.depth)];
}
