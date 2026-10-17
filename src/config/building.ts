import type { Meters, RoomDimensions } from '../types/room';

/** Gebäude: Etagen und Zimmer. */
export const BUILDING_CONFIG = {
  /** Deckenstärke zwischen zwei Etagen (Abstand Decke unten → Boden oben). */
  slabThickness: 0.25 as Meters,
  maxFloors: 10,
  maxRooms: 40,
  nameMaxLength: 40,
  /** Größe neuer Zimmer (lichte Innenmaße). */
  newRoom: { width: 4, length: 3 } as Pick<RoomDimensions, 'width' | 'length'>,
  /** Zimmer verschieben: Einrasten an Außenkanten anderer Zimmer (gemeinsame Wand) innerhalb dieser Pixel. */
  snapDistancePx: 12,
  /** Zwei Wände gelten als gemeinsame Wand, wenn ihr Abstand höchstens die Wandstärke plus diese Toleranz ist. */
  sharedWallTolerance: 0.02 as Meters,
  /** Mindestüberdeckung zweier Wände, damit sie als gemeinsam gelten. */
  sharedWallMinOverlap: 0.05 as Meters,
} as const;

export const DEFAULT_FLOOR_NAME = 'Erdgeschoss';
export const DEFAULT_ROOM_NAME = 'Raum 1';

/** Name der n-ten Etage (0 = Erdgeschoss): „Erdgeschoss“, „1. Obergeschoss“, … */
export function floorNameFor(index: number): string {
  return index <= 0 ? DEFAULT_FLOOR_NAME : `${index}. Obergeschoss`;
}
