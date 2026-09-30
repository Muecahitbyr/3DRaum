import type { WallDimension } from '../../types/room';
import type { RoomModel } from './model';

/**
 * Maßketten: jede Wand mit ihrer tatsächlichen lichten Länge, außen parallel zur Wand.
 * Richtung in Grundriss-Leserichtung (links → rechts bzw. oben → unten), damit Text und
 * Begrenzungsstriche einheitlich wirken.
 */
export function createWallDimensions(room: RoomModel): WallDimension[] {
  return room.walls.map((wall) => ({
    id: `dim-${wall.id}`,
    start: wall.readingReversed ? wall.end : wall.start,
    end: wall.readingReversed ? wall.start : wall.end,
    outwardNormal: { x: -wall.inward.x, z: -wall.inward.z },
    wallThickness: wall.thickness,
    length: wall.length,
  }));
}
