import { fixtureColliders, furnitureColliders, openingColliders, wallColliders } from '../collision/colliders';
import { FURNITURE_CATALOG } from '../config/furniture';
import { anyConflict } from '../collision/detect';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { FloorPoint } from '../types/room';
import { normalizeRotation } from './furniture';
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

export interface Placement {
  position: FloorPoint;
  rotationDeg: number;
}

/**
 * Freier Platz für ein neues Möbel – deterministisch, ohne Zufall:
 * 0. Wandmöbel (Katalog `placement: 'wall'`: Küchenzeile, WC, Waschtisch, Wanne …): mit der
 *    Rückseite an eine achsparallele Wand (längste zuerst), von der Wandmitte nach außen in
 *    25-cm-Schritten – mehrere Küchenschränke reihen sich so aneinander. Keine Küchenplanung,
 *    nur ein sinnvoller Startplatz.
 * 1. Kandidaten auf einem Raster (25 cm) um die Raummitte, nach Entfernung sortiert
 *    (gleiche Entfernung: feste Winkelreihenfolge), höchstens 600 Plätze.
 * 2. Jeder Kandidat wird in die tatsächliche Raumkontur geschoben (L-Form, schräge Wände).
 * 3. Der erste Platz ohne jede Kollision (Möbel, Wände, Türschwenk, Fenster, Heizkörper) gewinnt.
 * Gibt es keinen, bleibt es bei der Raummitte – die Kollisionswarnung zeigt den Konflikt.
 */
export function findFreePlacement(item: FurnitureItem, context: PlacementContext): Placement {
  if (FURNITURE_CATALOG[item.type].placement === 'wall') {
    const atWall = findWallPlacement(item, context);
    if (atWall) return atWall;
  }
  return { position: findFreePosition(item, context), rotationDeg: item.rotationDeg };
}

function obstaclesOf(item: FurnitureItem, { room, furniture, openings = [], fixtures = [] }: PlacementContext) {
  const support = supportElevations([...furniture, item], room.dimensions.height);
  return [
    ...furniture.flatMap((f) => furnitureColliders(f, room, support.get(f.id))),
    ...openings.flatMap((o) => openingColliders(o, room)),
    ...fixtures.flatMap((f) => fixtureColliders(f, room)),
    ...wallColliders(room),
  ];
}

const isFree = (candidate: FurnitureItem, furniture: readonly FurnitureItem[], context: PlacementContext, obstacles: ReturnType<typeof obstaclesOf>) => {
  const support = supportElevations([...furniture, candidate], context.room.dimensions.height).get(candidate.id);
  return !anyConflict(furnitureColliders(candidate, context.room, support), obstacles);
};

/** Platz mit der Rückseite (lokal −z) an einer achsparallelen Wand oder `null`. */
function findWallPlacement(item: FurnitureItem, context: PlacementContext): Placement | null {
  const { room, furniture } = context;
  const obstacles = obstaclesOf(item, context);
  const walls = room.walls
    .filter((w) => Math.abs(w.inward.x) > 0.999 || Math.abs(w.inward.z) > 0.999)
    .sort((a, b) => b.length - a.length || a.index - b.index);
  for (const wall of walls) {
    // Rückseite zur Wand: lokales −z zeigt entgegen der Innennormalen.
    const rotationDeg = normalizeRotation((Math.atan2(-wall.inward.x, wall.inward.z) * 180) / Math.PI);
    const shaped = { ...item, rotationDeg };
    const steps = Math.floor(wall.length / 2 / STEP);
    for (let k = 0; k <= 2 * steps; k++) {
      const along = wall.length / 2 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * STEP;
      const p = {
        x: wall.planStart.x + wall.axis.x * along + wall.inward.x * (item.depth / 2),
        z: wall.planStart.z + wall.axis.z * along + wall.inward.z * (item.depth / 2),
      };
      const position = nearestPositionInRoom(room, shaped, p);
      // Nur Plätze, die wirklich an dieser Wand liegen (nicht in eine Ecke weggeschoben).
      if (Math.hypot(position.x - p.x, position.z - p.z) > STEP) continue;
      const candidate = { ...shaped, position };
      if (isFree(candidate, furniture, context, obstacles)) return { position, rotationDeg };
    }
  }
  return null;
}

/** Freier Platz um die Raummitte (Drehung unverändert). */
export function findFreePosition(item: FurnitureItem, context: PlacementContext): FloorPoint {
  const { room, furniture } = context;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const obstacles = obstaclesOf(item, context);
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
    if (isFree({ ...item, position }, furniture, context, obstacles)) return position;
  }
  return fallback;
}
