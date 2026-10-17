import type { RoomDesign } from './design';
import type { RoomFixture } from './fixture';
import type { FurnitureGroup, FurnitureItem } from './furniture';
import type { Opening } from './opening';
import type { RoomPlan } from './room';

/**
 * Inhalt eines Zimmers: Grundriss, Öffnungen, Möbel, Raumobjekte, Gruppen und Gestaltung.
 * Das aktive Zimmer steht direkt im Planungszustand (und wird mit der bekannten Logik
 * bearbeitet); alle anderen Zimmer liegen als `RoomDocument` im Gebäude.
 */
export interface RoomDocument {
  room: RoomPlan;
  openings: Opening[];
  furniture: FurnitureItem[];
  fixtures: RoomFixture[];
  groups: FurnitureGroup[];
  design: RoomDesign;
}

/** Etage (Stockwerk). Die Reihenfolge im Gebäude ist von unten nach oben. */
export interface BuildingFloor {
  id: string;
  name: string;
}

/**
 * Zimmer im Gebäude. Alle Zimmer einer Etage teilen ein Weltkoordinatensystem: Ihre Lage
 * ergibt sich aus `room.origin` (Welt = Grundriss − origin). Liegen zwei Zimmer
 * Wand an Wand, teilen sie sich diese Wand (siehe `utils/building/sharedWalls`).
 */
export interface BuildingRoom {
  id: string;
  name: string;
  floorId: string;
  /** Inhalt – fehlt beim aktiven Zimmer (dessen Inhalt steht im Planungszustand). */
  doc?: RoomDocument;
}

/** Gebäude: Etagen (unten → oben), Zimmer und das gerade bearbeitete Zimmer. */
export interface Building {
  floors: BuildingFloor[];
  rooms: BuildingRoom[];
  activeRoomId: string;
}
