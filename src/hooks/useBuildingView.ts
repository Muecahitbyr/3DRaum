import { useMemo } from 'react';
import { DEFAULT_DESIGN } from '../config/design';
import type { PlannerState } from '../state/plannerState';
import type { Building, RoomDocument } from '../types/building';
import type { Opening } from '../types/opening';
import { activeRoomOf, floorElevations, isMultiRoom, roomDocumentOf } from '../utils/building/building';
import { roomsOverlap } from '../utils/building/placement';
import { computeSharedWalls, EMPTY_SHARED_WALLS, foreignOpeningsOf, fullySharedWalls, type SharedWalls, type WallShare } from '../utils/building/sharedWalls';
import type { FitShape } from '../utils/camera';
import { boundsOf, polygonArea } from '../utils/polygon';
import { roomModelOf, type RoomModel } from '../utils/room/model';

/** Nicht aktives Zimmer, das in der Szene als Umgebung erscheint. */
export interface ContextRoom {
  id: string;
  name: string;
  floorId: string;
  doc: RoomDocument;
  room: RoomModel;
  /** Höhenversatz gegenüber der aktiven Etage (Etagen darunter: negativ). */
  yOffset: number;
  /** Bodenhöhe der Etage über dem Erdgeschoss (> 0: Geschossdecke darunter). */
  elevation: number;
  /** Gleiche Etage wie das aktive Zimmer (sonst eine Etage darunter). */
  sameFloor: boolean;
  /** Gemeinsame Wände (Abschnitte, die ein anderes Zimmer zeichnet, und fremde Öffnungen). */
  shares: ReadonlyMap<string, WallShare> | null;
}

export interface FloorSummary {
  id: string;
  name: string;
  elevation: number;
  rooms: { id: string; name: string; area: number }[];
}

export interface BuildingView {
  building: Building;
  /** Mehr als ein Zimmer bzw. eine Etage (sonst verhält sich alles wie bisher). */
  multi: boolean;
  activeRoomId: string;
  activeRoomName: string;
  activeFloorId: string;
  floors: FloorSummary[];
  /** Gemeinsame Wände des aktiven Zimmers. */
  activeShares: ReadonlyMap<string, WallShare> | null;
  /** Wände des aktiven Zimmers, die ganz an Nachbarzimmer grenzen (ohne Wandmaß im Grundriss). */
  sharedWallIds: ReadonlySet<string>;
  /** Bodenhöhe der aktiven Etage über dem Erdgeschoss. */
  activeElevation: number;
  /** Öffnungen der Nachbarzimmer in gemeinsamen Wänden (auf die Wände des aktiven Zimmers umgerechnet). */
  foreignOpenings: Opening[];
  /** Andere Zimmer der aktiven Etage und der Etage darunter. */
  contextRooms: ContextRoom[];
  /** Zimmer der aktiven Etage, mit denen sich das aktive Zimmer überschneidet. */
  overlapping: string[];
  /** Einpassen auf die ganze Etage (nur bei mehreren Zimmern). */
  floorFitShape: FitShape | null;
}

const NO_OPENINGS: Opening[] = [];
const NO_WALLS: ReadonlySet<string> = new Set();

/**
 * Abgeleitete Sicht auf das Gebäude: Etagen mit Zimmern, Nachbarzimmer für die Szene,
 * gemeinsame Wände und fremde Öffnungen. Hängt nur vom Grundriss des aktiven Zimmers und vom
 * Gebäude ab – beim Ziehen von Möbeln oder Öffnungen bleibt alles unverändert.
 */
export function useBuildingView(state: PlannerState): BuildingView {
  const { building, room: activePlan } = state;
  return useMemo(() => {
    const active = activeRoomOf(building);
    const multi = isMultiRoom(building);
    // Für Etagenhöhen und gemeinsame Wände genügt der Grundriss des aktiven Zimmers.
    const activeDoc: RoomDocument = { room: activePlan, openings: [], furniture: [], fixtures: [], groups: [], design: DEFAULT_DESIGN };
    if (!multi) {
      return {
        building,
        multi,
        activeRoomId: active.id,
        activeRoomName: active.name,
        activeFloorId: active.floorId,
        floors: building.floors.map((f) => ({ id: f.id, name: f.name, elevation: 0, rooms: [{ id: active.id, name: active.name, area: polygonArea(activePlan.walls.map((w) => w.start)) }] })),
        activeShares: null,
        sharedWallIds: NO_WALLS,
        activeElevation: 0,
        foreignOpenings: NO_OPENINGS,
        contextRooms: [],
        overlapping: [],
        floorFitShape: null,
      };
    }
    const elevations = floorElevations(building, activeDoc);
    const docOf = (id: string) => roomDocumentOf(building, activeDoc, id);
    const floors: FloorSummary[] = building.floors.map((f) => ({
      id: f.id,
      name: f.name,
      elevation: elevations.get(f.id) ?? 0,
      rooms: building.rooms
        .filter((r) => r.floorId === f.id)
        .map((r) => ({ id: r.id, name: r.name, area: polygonArea(docOf(r.id)?.room.walls.map((w) => w.start) ?? []) })),
    }));

    // Aktive Etage: gemeinsame Wände (aktives Zimmer hat Vorrang, dann die Reihenfolge im Gebäude).
    const floorRooms = building.rooms.filter((r) => r.floorId === active.floorId);
    const ordered = [active, ...floorRooms.filter((r) => r.id !== active.id)];
    const entries = ordered.flatMap((r) => {
      const doc = docOf(r.id);
      return doc ? [{ id: r.id, room: roomModelOf(doc.room), openings: r.id === active.id ? NO_OPENINGS : doc.openings }] : [];
    });
    const shared: SharedWalls = entries.length > 1 ? computeSharedWalls(entries) : EMPTY_SHARED_WALLS;

    // Etage darunter (nur als Umgebung in 3D bzw. als Umriss im Grundriss).
    const floorIndex = building.floors.findIndex((f) => f.id === active.floorId);
    const below = floorIndex > 0 ? building.floors[floorIndex - 1] : null;
    const belowRooms = below ? building.rooms.filter((r) => r.floorId === below.id) : [];
    const belowEntries = belowRooms.flatMap((r) => {
      const doc = docOf(r.id);
      return doc ? [{ id: r.id, room: roomModelOf(doc.room), openings: doc.openings }] : [];
    });
    const belowShared = belowEntries.length > 1 ? computeSharedWalls(belowEntries) : EMPTY_SHARED_WALLS;
    const activeElevation = elevations.get(active.floorId) ?? 0;

    const contextRooms: ContextRoom[] = [
      ...entries.slice(1).map((e) => ({ e, sameFloor: true, shares: shared.get(e.id) ?? null, floorId: active.floorId })),
      ...belowEntries.map((e) => ({ e, sameFloor: false, shares: belowShared.get(e.id) ?? null, floorId: below!.id })),
    ].map(({ e, sameFloor, shares, floorId }) => {
      const meta = building.rooms.find((r) => r.id === e.id)!;
      return {
        id: e.id,
        name: meta.name,
        floorId,
        doc: docOf(e.id)!,
        room: e.room,
        yOffset: sameFloor ? 0 : (elevations.get(floorId) ?? 0) - activeElevation,
        elevation: elevations.get(floorId) ?? 0,
        sameFloor,
        shares,
      };
    });

    const activeModel = roomModelOf(activePlan);
    const overlapping = entries.slice(1).filter((e) => roomsOverlap(activeModel, e.room)).map((e) => e.id);
    const outline = entries.flatMap((e) => e.room.outerPolygon);
    const floorFitShape: FitShape = { outline, bounds: boundsOf(outline), height: Math.max(...entries.map((e) => e.room.dimensions.height)) };

    return {
      building,
      multi,
      activeRoomId: active.id,
      activeRoomName: active.name,
      activeFloorId: active.floorId,
      floors,
      activeShares: shared.get(active.id) ?? null,
      sharedWallIds: fullySharedWalls(shared, { id: active.id, walls: activeModel.walls }),
      activeElevation,
      foreignOpenings: foreignOpeningsOf(shared, active.id),
      contextRooms,
      overlapping,
      floorFitShape,
    };
  }, [building, activePlan]);
}
