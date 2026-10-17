import { BUILDING_CONFIG, DEFAULT_FLOOR_NAME, DEFAULT_ROOM_NAME } from '../../config/building';
import { DEFAULT_ROOM_DIMENSIONS } from '../../config/room';
import type { Building, BuildingFloor, BuildingRoom, RoomDocument } from '../../types/building';
import type { FloorPoint, Meters, RoomPlan } from '../../types/room';
import { roundToPrecision } from '../units';

/** Gebäude eines neuen Projekts: eine Etage mit einem Zimmer. */
export function createDefaultBuilding(): Building {
  return {
    floors: [{ id: 'floor-1', name: DEFAULT_FLOOR_NAME }],
    rooms: [{ id: 'room-1', name: DEFAULT_ROOM_NAME, floorId: 'floor-1' }],
    activeRoomId: 'room-1',
  };
}

export const DEFAULT_BUILDING: Building = createDefaultBuilding();

/** Aktives Zimmer (Metadaten). */
export function activeRoomOf(building: Building): BuildingRoom {
  return building.rooms.find((r) => r.id === building.activeRoomId) ?? building.rooms[0];
}

export function activeFloorOf(building: Building): BuildingFloor {
  const { floorId } = activeRoomOf(building);
  return building.floors.find((f) => f.id === floorId) ?? building.floors[0];
}

export const roomsOnFloor = (building: Building, floorId: string): BuildingRoom[] => building.rooms.filter((r) => r.floorId === floorId);

/** Hat das Projekt mehr als ein Zimmer bzw. mehr als eine Etage? */
export const isMultiRoom = (building: Building) => building.rooms.length > 1 || building.floors.length > 1;

/** Inhalt eines Zimmers – beim aktiven Zimmer aus dem Planungszustand. */
export function roomDocumentOf(building: Building, active: RoomDocument, roomId: string): RoomDocument | null {
  if (roomId === building.activeRoomId) return active;
  return building.rooms.find((r) => r.id === roomId)?.doc ?? null;
}

/**
 * Höhe des Bodens jeder Etage über dem Erdgeschoss: Summe der darunterliegenden
 * Etagenhöhen (höchstes Zimmer) plus Deckenstärke.
 */
export function floorElevations(building: Building, active: RoomDocument): Map<string, Meters> {
  const result = new Map<string, Meters>();
  let elevation = 0;
  for (const floor of building.floors) {
    result.set(floor.id, roundToPrecision(elevation));
    const heights = roomsOnFloor(building, floor.id)
      .map((r) => roomDocumentOf(building, active, r.id)?.room.height)
      .filter((h): h is number => typeof h === 'number');
    elevation += (heights.length ? Math.max(...heights) : DEFAULT_ROOM_DIMENSIONS.height) + BUILDING_CONFIG.slabThickness;
  }
  return result;
}

/** Freier Name „<Basis> n“ (kleinstes n, das noch nicht vergeben ist). */
export function nextNumberedName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** Name bereinigen (Leerraum, Länge); leer → Ersatzname. */
export function cleanName(name: string, fallback: string): string {
  const text = name.replace(/\s+/g, ' ').trim().slice(0, BUILDING_CONFIG.nameMaxLength);
  return text || fallback;
}

/** Lage eines Zimmers im Gebäude: linke/obere Ecke seines Innenumrisses (Welt). */
export const roomPositionOf = (plan: RoomPlan): FloorPoint => ({ x: roundToPrecision(-plan.origin.x), z: roundToPrecision(-plan.origin.z) });

/** Zimmer an eine Lage (linke/obere Innenecke, Welt) setzen – nur `origin` ändert sich. */
export const withRoomPosition = (plan: RoomPlan, position: FloorPoint): RoomPlan => ({
  ...plan,
  origin: { x: roundToPrecision(-position.x), z: roundToPrecision(-position.z) },
});
