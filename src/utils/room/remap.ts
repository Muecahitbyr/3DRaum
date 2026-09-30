import type { Meters } from '../../types/room';
import { closestOnSegment, samePoint } from '../polygon';
import type { RoomModel } from './model';

interface WallBound {
  wall: string;
  offset: Meters;
  width: Meters;
}

/**
 * Ordnet ein wandgebundenes Element (Tür, Fenster, Raumobjekt) nach einer
 * Grundrissänderung neu zu. Beide Modelle müssen im selben Grundrisssystem liegen
 * (vor der Normalisierung).
 *
 * - Wand besteht weiter: Abstand zum unveränderten Wandende bleibt erhalten
 *   (Ecke am Anfang verschoben → Abstand zum Ende bleibt, sonst zum Anfang).
 * - Wand entfernt oder geteilt: Element geht an die Wand, die seiner bisherigen
 *   Mitte am nächsten liegt, an die entsprechende Stelle.
 * Das Begrenzen auf die Wandlänge übernimmt danach die jeweilige Normalisierung.
 */
export function remapWallItem<T extends WallBound>(item: T, before: RoomModel, after: RoomModel, nearestFor?: ReadonlySet<string>): T | null {
  const oldWall = before.wallById.get(item.wall);
  const kept = after.wallById.get(item.wall);
  if (!oldWall) return kept ? item : null;
  if (kept && !nearestFor?.has(item.wall)) {
    const startSame = samePoint(oldWall.planStart, kept.planStart);
    const endSame = samePoint(oldWall.planEnd, kept.planEnd);
    if (!startSame && endSame) {
      const offset = kept.length - (oldWall.length - item.offset);
      return offset === item.offset ? item : { ...item, offset };
    }
    return item;
  }
  const along = item.offset + item.width / 2;
  const center = {
    x: oldWall.planStart.x + oldWall.axis.x * along,
    z: oldWall.planStart.z + oldWall.axis.z * along,
  };
  let best: { wall: string; offset: Meters; distance: number } | null = null;
  for (const wall of after.walls) {
    const hit = closestOnSegment(center, wall.planStart, wall.planEnd);
    if (!best || hit.distance < best.distance - 1e-9) best = { wall: wall.id, offset: hit.t * wall.length - item.width / 2, distance: hit.distance };
  }
  return best ? { ...item, wall: best.wall, offset: best.offset } : null;
}
