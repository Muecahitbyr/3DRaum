import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { RoomModel } from '../utils/room/model';
import { fixtureColliders, furnitureColliders, openingColliders, wallColliders } from './colliders';
import { detectCollisions } from './detect';
import type { CollisionReport } from './types';

export { describeCollisions, type CollisionMessage } from './messages';
export type { CollisionReport, CollisionSeverity, ObjectRef } from './types';

/** Kollisionsbericht für den gesamten Plan. */
export function computeCollisionReport(
  room: RoomModel,
  openings: readonly Opening[],
  furniture: readonly FurnitureItem[],
  fixtures: readonly RoomFixture[] = [],
): CollisionReport {
  return detectCollisions([
    ...furniture.flatMap((item) => furnitureColliders(item, room)),
    ...openings.flatMap((opening) => openingColliders(opening, room)),
    ...fixtures.flatMap((fixture) => fixtureColliders(fixture, room)),
    ...wallColliders(room),
  ]);
}
