import { computeCollisionReport } from '../../src/collision/index.ts';
import { BUILDING_CONFIG } from '../../src/config/building.ts';
import { parseProject, PROJECT_FORMAT_VERSION, serializeProject } from '../../src/projects/format.ts';
import { documentOf, historyReducer, initialHistoryState, type HistoryState } from '../../src/state/history.ts';
import type { PlannerAction } from '../../src/state/plannerState.ts';
import type { Opening } from '../../src/types/opening.ts';
import { floorElevations, roomPositionOf } from '../../src/utils/building/building.ts';
import { placeNewRoom, roomsOverlap, snapRoomMove } from '../../src/utils/building/placement.ts';
import { computeSharedWalls, foreignOpeningsOf, mirrorOpening, sharedSpan } from '../../src/utils/building/sharedWalls.ts';
import { furnitureToWorld } from '../../src/utils/furniture.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { createRectangleRoom } from '../../src/utils/room/plan.ts';
import { createSuite } from './harness.ts';

/** Mehrere Zimmer und Etagen: Gebäude-Reducer, Verlauf, gemeinsame Wände, Platzierung, Format 8. */
const { check, near, done } = createSuite();
const run = (actions: PlannerAction[], start: HistoryState = initialHistoryState) => actions.reduce(historyReducer, start);
const docOf = (h: HistoryState, id: string) => (id === h.present.building.activeRoomId ? h.present : h.present.building.rooms.find((r) => r.id === id)?.doc);
const fileOf = (h: HistoryState) =>
  ({ format: 'raumplaner-project', version: PROJECT_FORMAT_VERSION, id: 'haus', name: 'Haus', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', plan: documentOf(h.present) }) as const;

// ---------- Ausgangslage: ein Zimmer, eine Etage (wie bisher)
const start = initialHistoryState.present;
check('Neues Projekt: eine Etage „Erdgeschoss“ mit einem Zimmer „Raum 1“', start.building.floors.length === 1 && start.building.floors[0].name === 'Erdgeschoss' && start.building.rooms.length === 1 && start.building.rooms[0].name === 'Raum 1' && start.building.activeRoomId === 'room-1');
const single = JSON.parse(serializeProject(fileOf(initialHistoryState)));
check('Format 8, ein Zimmer: Gebäude gespeichert, Raum weiterhin ohne Ursprung', PROJECT_FORMAT_VERSION === 8 && single.plan.building.rooms.length === 1 && !('origin' in single.plan.room) && !('doc' in single.plan.building.rooms[0]));

// ---------- Zimmer hinzufügen: Wand an Wand, gemeinsame Wand
let h = run([{ type: 'addFurniture', furnitureType: 'sofa' }]);
const sofaId = h.present.furniture[0].id;
h = run([{ type: 'addRoom' }], h);
const firstModel = roomModelOf(h.present.building.rooms[0].doc!.room);
const secondModel = roomModelOf(h.present.room);
check('Zimmer hinzufügen: zwei Zimmer, das neue ist aktiv und leer', h.present.building.rooms.length === 2 && h.present.building.activeRoomId === 'room-2' && h.present.furniture.length === 0 && h.present.building.rooms[1].name === 'Raum 2');
check('Altes Zimmer samt Sofa im Gebäude abgelegt', h.present.building.rooms[0].doc?.furniture[0]?.id === sofaId && !h.present.building.rooms[1].doc);
check('Neues Zimmer rechts daneben: Innenkante = Außenkante der Ostwand (gemeinsame Wand)', near(Math.min(...secondModel.worldPolygon.map((p) => p.x)), Math.max(...firstModel.worldPolygon.map((p) => p.x)) + 0.15, 1e-6) && near(Math.min(...secondModel.worldPolygon.map((p) => p.z)), Math.min(...firstModel.worldPolygon.map((p) => p.z)), 1e-6));
check('Neues Zimmer 4 × 3 m, Raumhöhe übernommen', near(secondModel.dimensions.width, BUILDING_CONFIG.newRoom.width) && near(secondModel.dimensions.length, BUILDING_CONFIG.newRoom.length) && secondModel.dimensions.height === 2.5);
check('Verlauf: ein Schritt „Zimmer hinzufügen“', h.past.at(-1)?.label === 'Zimmer hinzufügen');
const undone = run([{ type: 'history/undo' }], h);
check('Rückgängig: wieder ein Zimmer, Sofa zurück im aktiven Zimmer', undone.present.building.rooms.length === 1 && undone.present.furniture[0]?.id === sofaId);

// ---------- Zimmer wechseln: kein Verlaufsschritt, Inhalte bleiben erhalten
const pastBefore = h.past.length;
h = run([{ type: 'switchRoom', id: 'room-1' }], h);
check('Zimmer wechseln: Inhalt geladen, kein Verlaufsschritt, Auswahl leer', h.present.building.activeRoomId === 'room-1' && h.present.furniture[0]?.id === sofaId && h.past.length === pastBefore && h.present.selection === null);
check('Beim Wechsel abgelegt: leeres Zimmer 2', h.present.building.rooms[1].doc?.furniture.length === 0);
h = run([{ type: 'switchRoom', id: 'room-2' }, { type: 'addFurniture', furnitureType: 'chair' }], h);
check('IDs bleiben über Zimmer eindeutig (kein zweites furniture-1)', h.present.furniture[0].id !== sofaId, h.present.furniture[0].id);
const afterChair = run([{ type: 'switchRoom', id: 'room-1' }, { type: 'history/undo' }], h);
check('Undo nach Zimmerwechsel: macht die letzte Änderung rückgängig und zeigt deren Zimmer', afterChair.present.building.activeRoomId === 'room-2' && afterChair.present.furniture.length === 0);
const redone = run([{ type: 'history/redo' }], afterChair);
check('Redo: Stuhl wieder da', redone.present.furniture.length === 1);

// ---------- Gemeinsame Wände
const east = firstModel.wallById.get('east')!;
const west = secondModel.wallById.get('west')!;
const span = sharedSpan(east, west);
check('Ostwand (Zimmer 1) und Westwand (Zimmer 2) sind eine gemeinsame Wand (Länge 3 m)', !!span && near(span.from, 0) && near(span.to, 3, 1e-6), span);
check('Nicht gemeinsam: Nordwand und Westwand', sharedSpan(firstModel.wallById.get('north')!, west) === null);
const door: Opening = { id: 'opening-1', type: 'door', wall: 'west', offset: 1, width: 0.9, height: 2.1, hinge: 'left', swing: 'inward' };
const mirrored = mirrorOpening(door, west, east, 'room-2') as Extract<Opening, { type: 'door' }>;
check('Tür in der gemeinsamen Wand: gespiegelt (Anschlag rechts, nach außen), gleiche Weltlage', mirrored.wall === 'east' && near(mirrored.offset, 1.1, 1e-6) && mirrored.width === 0.9 && mirrored.hinge === 'right' && mirrored.swing === 'outward' && mirrored.id === 'room-2:opening-1', mirrored);
const shared = computeSharedWalls([
  { id: 'room-1', room: firstModel, openings: [] },
  { id: 'room-2', room: secondModel, openings: [door] },
]);
const hidden = shared.get('room-2')?.get('west')?.hidden ?? [];
check('Vorrang: Zimmer 1 zeichnet die Wand, bei Zimmer 2 entfällt sie (inkl. Gehrung)', hidden.length === 1 && hidden[0].x0 === -Infinity && hidden[0].x1 === Infinity && hidden[0].y1 === 2.5, hidden);
check('Die Tür von Zimmer 2 durchbricht die gezeichnete Wand von Zimmer 1', foreignOpeningsOf(shared, 'room-1').length === 1 && shared.get('room-1')?.get('east')?.foreign[0].id === 'room-2:opening-1');
// Schrank vor der Tür im Zimmer 1: Die Tür von Zimmer 2 öffnet nach außen, also in Zimmer 1.
const outwardShared = computeSharedWalls([
  { id: 'room-1', room: firstModel, openings: [] },
  { id: 'room-2', room: secondModel, openings: [{ ...door, swing: 'outward' }] },
]);
const wardrobe = { id: 'furniture-9', type: 'wardrobe', name: 'Schrank', width: 1, depth: 0.6, height: 2, position: { x: 4.6, z: 1.55 }, rotationDeg: 90 } as const;
const report = computeCollisionReport(firstModel, foreignOpeningsOf(outwardShared, 'room-1'), [wardrobe]);
const intoRoom2 = computeCollisionReport(firstModel, foreignOpeningsOf(shared, 'room-1'), [wardrobe]);
check('Kollision: Möbel im Schwenkbereich der Nachbartür wird gemeldet', report.hits.some((hit) => hit.rule === 'door-swing'), report.hits.map((x) => x.rule));
check('Öffnet die Nachbartür in ihr eigenes Zimmer, ist der Platz davor frei', !intoRoom2.hits.some((hit) => hit.rule === 'door-swing'), intoRoom2.hits.map((x) => x.rule));

// ---------- Platzierung und Einrasten
const occupied = placeNewRoom(firstModel, [firstModel, secondModel], { width: 4, length: 3 });
check('Rechts belegt → neues Zimmer unten (bündig links)', near(occupied.z, Math.max(...firstModel.worldPolygon.map((p) => p.z)) + 0.15, 1e-6) && near(occupied.x, Math.min(...firstModel.worldPolygon.map((p) => p.x)), 1e-6), occupied);
const snapped = snapRoomMove(secondModel, { x: 0.07, z: 0.03 }, [firstModel], 0.12);
check('Verschieben: rastet an der Nachbarwand (x) und an der Flucht (z) ein', near(snapped.delta.x, 0) && near(snapped.delta.z, 0) && snapped.guides.length === 2, snapped);
const free = snapRoomMove(secondModel, { x: 0.5, z: 0.5 }, [firstModel], 0.12);
check('Weit weg: kein Einrasten', near(free.delta.x, 0.5) && near(free.delta.z, 0.5) && free.guides.length === 0, free);
check('Überschneidung erkannt (nur bei echter Überdeckung)', !roomsOverlap(firstModel, secondModel) && roomsOverlap(firstModel, roomModelOf({ ...secondModel.plan, origin: { x: secondModel.plan.origin.x + 1, z: secondModel.plan.origin.z } })));
const flush = roomModelOf({ ...secondModel.plan, origin: { x: secondModel.plan.origin.x + 2, z: secondModel.plan.origin.z } });
check('Überschneidung mit bündigen Ober-/Unterkanten (keine Kantenkreuzung) erkannt', roomsOverlap(firstModel, flush) && roomsOverlap(flush, firstModel));

// ---------- Zimmer verschieben, Form wechseln
h = run([{ type: 'switchRoom', id: 'room-2' }], h);
const before = roomPositionOf(h.present.room);
const chairWorld = furnitureToWorld(h.present.furniture[0].position, h.present.room);
h = run([{ type: 'setRoomPosition', position: { x: before.x + 1, z: before.z } }], h);
const chairAfter = furnitureToWorld(h.present.furniture[0].position, h.present.room);
check('Zimmer verschieben: Lage +1 m, Möbel wandern mit, Schritt „Zimmer verschieben“', near(roomPositionOf(h.present.room).x, before.x + 1, 1e-6) && near(chairAfter.x, chairWorld.x + 1, 1e-6) && h.past.at(-1)?.label === 'Zimmer verschieben');
h = run([{ type: 'setRoomShape', shape: 'l-shape' }], h);
check('Mehrere Zimmer: Formwechsel behält die Lage (linke obere Ecke)', near(roomPositionOf(h.present.room).x, before.x + 1, 1e-6) && near(roomPositionOf(h.present.room).z, before.z, 1e-6));
h = run([{ type: 'history/undo' }, { type: 'history/undo' }], h);

// ---------- Etagen
h = run([{ type: 'addFloor' }], h);
check('Etage hinzufügen: „1. Obergeschoss“ mit Zimmer im gleichen Umriss, aktiv', h.present.building.floors.length === 2 && h.present.building.floors[1].name === '1. Obergeschoss' && h.present.building.rooms.at(-1)?.floorId === h.present.building.floors[1].id && h.present.building.activeRoomId === h.present.building.rooms.at(-1)?.id && JSON.stringify(h.present.room.walls) === JSON.stringify(h.present.building.rooms[1].doc?.room.walls));
const elevations = floorElevations(h.present.building, h.present);
check('Etagenhöhe: Erdgeschoss 0, Obergeschoss = Raumhöhe + Deckenstärke', elevations.get('floor-1') === 0 && near(elevations.get(h.present.building.floors[1].id)!, 2.5 + BUILDING_CONFIG.slabThickness, 1e-9));
h = run([{ type: 'renameFloor', id: h.present.building.floors[1].id, name: 'Dachgeschoss' }, { type: 'renameRoom', id: h.present.building.activeRoomId, name: 'Bad' }], h);
check('Umbenennen: Etage und Zimmer (je ein Schritt)', h.present.building.floors[1].name === 'Dachgeschoss' && h.present.building.rooms.at(-1)?.name === 'Bad' && h.past.at(-1)?.label === 'Zimmer umbenennen' && h.past.at(-2)?.label === 'Etage umbenennen');
const pastFloor = h.past.length;
h = run([{ type: 'switchFloor', id: 'floor-1' }], h);
check('Etage wechseln: erstes Zimmer der Etage, kein Schritt', h.present.building.activeRoomId === 'room-1' && h.past.length === pastFloor);

// ---------- Speichern und Laden (Format 8)
const text = serializeProject(fileOf(h));
const parsed = parseProject(text);
const json = JSON.parse(text);
check('Mehrere Zimmer: jedes Zimmer behält seinen Ursprung', 'origin' in json.plan.room && json.plan.building.rooms.filter((r: { doc?: { room: object } }) => r.doc).every((r: { doc: { room: object } }) => 'origin' in r.doc.room));
check('Speichern → Laden: Etagen, Zimmer, Namen, aktives Zimmer, keine Warnungen', parsed.ok && parsed.warnings.length === 0 && parsed.project.plan.building.floors.length === 2 && parsed.project.plan.building.rooms.length === 3 && parsed.project.plan.building.activeRoomId === 'room-1' && parsed.project.plan.building.rooms[2].name === 'Bad', parsed.ok ? parsed.warnings : parsed);
if (parsed.ok) {
  const loaded = parsed.project.plan;
  const room2 = loaded.building.rooms[1].doc!;
  const original2 = docOf(h, 'room-2')!;
  check('Lage der Zimmer zueinander bleibt exakt erhalten', JSON.stringify(roomModelOf(room2.room).worldPolygon) === JSON.stringify(roomModelOf(original2.room).worldPolygon) && JSON.stringify(roomModelOf(loaded.room).worldPolygon) === JSON.stringify(roomModelOf(h.present.room).worldPolygon));
  check('Inhalte der anderen Zimmer bleiben erhalten (Möbel)', room2.furniture.length === original2.furniture.length && room2.furniture[0]?.id === original2.furniture[0]?.id);
  const reloaded = run([{ type: 'history/reset', document: loaded }]);
  check('Laden: ID-Zähler über alle Zimmer (neue Möbel ohne Doppel-ID)', reloaded.present.nextFurnitureNumber > Math.max(...[loaded, ...loaded.building.rooms.map((r) => r.doc).filter((d) => !!d)].flatMap((d) => d!.furniture.map((f) => Number(f.id.split('-')[1])))) && reloaded.present.nextRoomNumber === 4 && reloaded.present.nextFloorNumber === 3);
}
const broken = JSON.parse(text);
broken.plan.building.rooms[1].doc.room.walls = [];
const brokenParsed = parseProject(JSON.stringify(broken));
check('Defektes Zimmer: übersprungen, Warnung, Rest lesbar', brokenParsed.ok && brokenParsed.project.plan.building.rooms.length === 2 && brokenParsed.warnings.some((w) => w.includes('Zimmer')), brokenParsed.ok ? brokenParsed.warnings : brokenParsed);
const noActive = JSON.parse(text);
noActive.plan.building.activeRoomId = 'gibt-es-nicht';
const repaired = parseProject(JSON.stringify(noActive));
check('Fehlendes aktives Zimmer: wird ergänzt, Projekt bleibt lesbar', repaired.ok && repaired.project.plan.building.rooms.some((r) => r.id === repaired.project.plan.building.activeRoomId && !r.doc));
const v7 = parseProject(JSON.stringify({ ...JSON.parse(serializeProject(fileOf(initialHistoryState))), version: 7, plan: { ...JSON.parse(serializeProject(fileOf(initialHistoryState))).plan, building: undefined } }));
check('Version 7 → 8: eine Etage, ein Zimmer, ohne Warnungen', v7.ok && v7.project.version === 8 && v7.project.plan.building.rooms.length === 1 && v7.warnings.length === 0);
const future = parseProject(JSON.stringify({ ...json, version: 9 }));
check('Version 9 wird als „neuere Version“ abgelehnt', !future.ok && future.error.includes('neueren Version'));

// ---------- Löschen
h = run([{ type: 'removeRoom', id: 'room-1' }], h);
check('Aktives Zimmer löschen: Nachbar auf derselben Etage wird aktiv', h.present.building.rooms.length === 2 && h.present.building.activeRoomId === 'room-2' && h.past.at(-1)?.label === 'Zimmer löschen');
h = run([{ type: 'removeFloor', id: h.present.building.floors[1].id }], h);
check('Etage löschen: ihre Zimmer entfallen', h.present.building.floors.length === 1 && h.present.building.rooms.length === 1 && h.present.building.activeRoomId === 'room-2');
const last = run([{ type: 'removeRoom', id: 'room-2' }, { type: 'removeFloor', id: 'floor-1' }], h);
check('Letztes Zimmer und letzte Etage bleiben immer', last.present.building.rooms.length === 1 && last.present.building.floors.length === 1 && last.past.length === h.past.length);
const restored = run([{ type: 'history/undo' }, { type: 'history/undo' }], h);
check('Rückgängig: Etage und Zimmer wieder da', restored.present.building.floors.length === 2 && restored.present.building.rooms.length === 3);

// ---------- Grenzen
let many = initialHistoryState;
for (let i = 0; i < BUILDING_CONFIG.maxRooms + 2; i++) many = run([{ type: 'addRoom' }], many);
check(`Höchstens ${BUILDING_CONFIG.maxRooms} Zimmer, danach Hinweis`, many.present.building.rooms.length === BUILDING_CONFIG.maxRooms && many.present.roomFeedback?.message.includes('Zimmer') === true);
const roomsOk = many.present.building.rooms.every((r) => {
  const plan = r.doc?.room ?? many.present.room;
  return roomModelOf(plan).walls.length === 4;
});
check('Alle angelegten Zimmer sind gültige Rechtecke', roomsOk);
const overlapsAny = many.present.building.rooms.some((a, i) =>
  many.present.building.rooms.some((b, j) => j > i && roomsOverlap(roomModelOf((a.doc ?? many.present).room), roomModelOf((b.doc ?? many.present).room))),
);
check('Automatisch platzierte Zimmer überschneiden sich nie', !overlapsAny);
const rect = createRectangleRoom({ width: 3, length: 3, height: 2.5 });
check('Neues Zimmer ohne aktives Zimmer: mittig', JSON.stringify(placeNewRoom(null, [], { width: 4, length: 3 })) === JSON.stringify({ x: -2, z: -1.5 }) && rect.walls.length === 4);

done();
