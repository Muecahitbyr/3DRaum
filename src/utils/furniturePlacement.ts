import { fixtureColliders, furnitureColliders, openingColliders, wallColliders } from '../collision/colliders';
import { anyConflict } from '../collision/detect';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { FloorPoint } from '../types/room';
import { supportElevations } from './furnitureSupport';
import { nearestPositionInRoom } from './room/containment';
import type { RoomModel } from './room/model';

/** Rasterweite der Platzsuche (m) und Obergrenze der geprüften Plätze. */
const STEP = 0.25;
const MAX_CANDIDATES = 600;

export interface PlacementContext {
  room: RoomModel;
  furniture: readonly FurnitureItem[];
  openings?: readonly Opening[];
  fixtures?: readonly RoomFixture[];
}

/**
 * Freier Platz für ein neues Möbel – deterministisch, ohne Zufall:
 * 1. Kandidaten auf einem Raster (25 cm) um die Raummitte, nach Entfernung sortiert
 *    (gleiche Entfernung: feste Winkelreihenfolge), höchstens 600 Plätze.
 * 2. Jeder Kandidat wird in die tatsächliche Raumkontur geschoben (L-Form, schräge Wände).
 * 3. Der erste Platz ohne jede Kollision (Möbel, Wände, Türschwenk, Fenster, Heizkörper) gewinnt.
 * Gibt es keinen, bleibt es bei der Raummitte – die Kollisionswarnung zeigt den Konflikt.
 */
export function findFreePosition(item: FurnitureItem, { room, furniture, openings = [], fixtures = [] }: PlacementContext): FloorPoint {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const support = supportElevations([...furniture, item], room.dimensions.height);
  const obstacles = [
    ...furniture.flatMap((f) => furnitureColliders(f, room, support.get(f.id))),
    ...openings.flatMap((o) => openingColliders(o, room)),
    ...fixtures.flatMap((f) => fixtureColliders(f, room)),
    ...wallColliders(room),
  ];
  const fallback = nearestPositionInRoom(room, item, center);
  const rings = Math.ceil(Math.max(maxX - minX, maxZ - minZ) / 2 / STEP) + 1;
  const offsets: { x: number; z: number; d: number; a: number }[] = [];
  for (let ix = -rings; ix <= rings; ix++) {
    for (let iz = -rings; iz <= rings; iz++) offsets.push({ x: ix * STEP, z: iz * STEP, d: Math.hypot(ix, iz), a: Math.atan2(iz, ix) });
  }
  offsets.sort((p, q) => p.d - q.d || p.a - q.a);
  const tried = new Set<string>();
  for (const offset of offsets.slice(0, MAX_CANDIDATES)) {
    const position = nearestPositionInRoom(room, item, { x: center.x + offset.x, z: center.z + offset.z });
    const key = `${position.x}|${position.z}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const candidate = { ...item, position };
    const candidateSupport = supportElevations([...furniture, candidate], room.dimensions.height).get(item.id);
    if (!anyConflict(furnitureColliders(candidate, room, candidateSupport), obstacles)) return position;
  }
  return fallback;
}
