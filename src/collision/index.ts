import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { RoomModel } from '../utils/room/model';
import { fixtureColliders, furnitureColliders, openingColliders, wallColliders } from './colliders';
import { detectCollisions } from './detect';
import type { Collider, CollisionReport } from './types';
import { supportElevations } from '../utils/furnitureSupport';

export { describeCollisions, type CollisionMessage } from './messages';
export type { CollisionReport, CollisionSeverity, ObjectRef } from './types';

/**
 * Collider je Möbel zwischenspeichern: Beim Ziehen ändert sich nur das gezogene Möbel –
 * alle anderen behalten ihre Objektidentität und ihre bereits berechneten Zonen.
 */
const colliderCache = new WeakMap<FurnitureItem, { room: RoomModel; supportY: number | undefined; colliders: Collider[] }>();

function cachedFurnitureColliders(item: FurnitureItem, room: RoomModel, supportY: number | undefined): Collider[] {
  const cached = colliderCache.get(item);
  if (cached && cached.room === room && cached.supportY === supportY) return cached.colliders;
  const colliders = furnitureColliders(item, room, supportY);
  colliderCache.set(item, { room, supportY, colliders });
  return colliders;
}

/** Kollisionsbericht für den gesamten Plan. */
export function computeCollisionReport(
  room: RoomModel,
  openings: readonly Opening[],
  furniture: readonly FurnitureItem[],
  fixtures: readonly RoomFixture[] = [],
): CollisionReport {
  // Tischlampen auf Trägern (Nachttisch, Schreibtisch …) stehen auf deren Oberseite.
  const support = supportElevations(furniture, room.dimensions.height);
  return detectCollisions([
    ...furniture.flatMap((item) => cachedFurnitureColliders(item, room, support.get(item.id))),
    ...openings.flatMap((opening) => openingColliders(opening, room)),
    ...fixtures.flatMap((fixture) => fixtureColliders(fixture, room)),
    ...wallColliders(room),
  ]);
}

/**
 * Kollidieren zwei Möbel nach dem semantischen Modell (Zonen + Höhen)? Für Abstandsmaße:
 * Überdecken sich nur die Grundflächen (Stuhl unter dem Tisch), ist das keine Kollision.
 */
export function furnitureCollide(a: FurnitureItem, b: FurnitureItem, room: RoomModel, all: readonly FurnitureItem[] = [a, b]): boolean {
  const support = supportElevations(all, room.dimensions.height);
  const report = detectCollisions([
    ...cachedFurnitureColliders(a, room, support.get(a.id)),
    ...cachedFurnitureColliders(b, room, support.get(b.id)),
  ]);
  return report.hits.length > 0;
}
