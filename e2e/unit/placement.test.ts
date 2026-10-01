import { computeCollisionReport } from '../../src/collision/index.ts';
import { parseProject, serializeProject } from '../../src/projects/format.ts';
import { historyReducer, initialHistoryState, type HistoryState } from '../../src/state/history.ts';
import type { PlannerAction } from '../../src/state/plannerState.ts';
import type { FurnitureItem, FurnitureType } from '../../src/types/furniture.ts';
import { createFurniture } from '../../src/utils/furniture.ts';
import { findFreePosition } from '../../src/utils/furniturePlacement.ts';
import { formationCenter, rotateFormation, rotatePoint } from '../../src/utils/furnitureRotation.ts';
import { supportOf } from '../../src/utils/furnitureSupport.ts';
import { fitsInRoom } from '../../src/utils/room/containment.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { createLShapeRoom, createRectangleRoom } from '../../src/utils/room/plan.ts';
import { createSuite } from './harness.ts';

/** Intelligente Platzierung, gemeinsames Drehen (Auswahl/Gruppe), Gruppennamen, Tischlampe auf Trägern. */
const { check, near, done } = createSuite();
const run = (actions: PlannerAction[], start: HistoryState = initialHistoryState) => actions.reduce(historyReducer, start);
const hitsOf = (h: HistoryState) => computeCollisionReport(roomModelOf(h.present.room), h.present.openings, h.present.furniture, h.present.fixtures).hits.length;
const add = (type: FurnitureType) => ({ type: 'addFurniture', furnitureType: type }) as PlannerAction;

// ---------- Intelligente Platzierung
let h = run([add('sofa')]);
check('Erstes Möbel im leeren Raum: Raummitte (wie bisher)', JSON.stringify(h.present.furniture[0].position) === '{"x":2.5,"z":2}');
h = run([add('sofa'), add('sofa')], h);
const sofas = h.present.furniture.map((f) => f.position);
check('Gleiches Möbel mehrfach: versetzte Positionen, keine Kollisionen', JSON.stringify(sofas) === '[{"x":2.5,"z":2},{"x":2.5,"z":1},{"x":2.5,"z":3}]' && hitsOf(h) === 0, sofas);
const again = run([add('sofa'), add('sofa'), add('sofa')]);
check('Gleiche Eingaben → gleiche Positionen (kein Zufall)', JSON.stringify(again.present.furniture.map((f) => f.position)) === JSON.stringify(sofas));
const fourth = run([add('sofa')], h);
check('Viertes Sofa (2 × 0,9 m) passt nicht mehr: Raummitte, Kollision wird gemeldet', JSON.stringify(fourth.present.furniture[3].position) === '{"x":2.5,"z":2}' && hitsOf(fourth) > 0);
let full = run([{ type: 'setRoomDimension', key: 'width', value: 1 }, { type: 'setRoomDimension', key: 'length', value: 1 }, add('double-bed')]);
full = run([add('wardrobe')], full);
check('Kein freier Platz (Raum 1 × 1): trotzdem platziert, Kollision wird gemeldet', full.present.furniture.length === 2 && hitsOf(full) > 0);
const lPlan = createLShapeRoom(2.5); // Hüllenmitte (3; 2,5) liegt nahe der Aussparung
const lRoom = roomModelOf(lPlan);
const table = createFurniture('table', 'furniture-1', [], lRoom);
const lPos = findFreePosition(table, { room: lRoom, furniture: [] });
check('L-Form: Platz innerhalb der echten Kontur', fitsInRoom(lRoom, table, lPos, true), lPos);
const door = { id: 'opening-1', type: 'door', wall: 'south', offset: 2.05, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' } as const;
const doorRoom = roomModelOf(createRectangleRoom({ width: 5, length: 2.2, height: 2.5 }));
const bed = createFurniture('bed', 'furniture-1', [], doorRoom);
const bedPos = findFreePosition(bed, { room: doorRoom, furniture: [], openings: [door] });
check('Türschwenk wird gemieden (Bett nicht im Schwenkbereich)', computeCollisionReport(doorRoom, [door], [{ ...bed, position: bedPos }]).hits.length === 0, bedPos);
let many = initialHistoryState;
for (let i = 0; i < 40; i++) many = run([add('chair')], many);
check('40 Stühle nacheinander: alle im Raum, alle konfliktfrei', many.present.furniture.length === 40 && hitsOf(many) === 0);

// ---------- Gemeinsames Drehen
const room = roomModelOf(createRectangleRoom({ width: 6, length: 5, height: 2.5 }));
check('Punkt drehen: 90° im Uhrzeigersinn (Grundriss, z nach unten)', JSON.stringify(rotatePoint({ x: 1, z: 0 }, { x: 0, z: 0 }, 90)) === JSON.stringify({ x: 6.123233995736766e-17, z: 1 }));
const set = [
  { id: 'a', width: 1.6, depth: 0.9, rotationDeg: 0, position: { x: 3, z: 2.5 } },
  { id: 'b', width: 0.45, depth: 0.52, rotationDeg: 0, position: { x: 3, z: 1.94 } },
  { id: 'c', width: 0.45, depth: 0.52, rotationDeg: 180, position: { x: 3, z: 3.06 } },
];
const pivot = formationCenter(set);
check('Drehpunkt: Mitte der Auswahl', near(pivot.x, 3) && near(pivot.z, 2.5));
const r90 = rotateFormation(set, pivot, 90, room)!;
check('90°: Tisch dreht sich, Stühle kreisen mit und drehen sich', r90.a.rotationDeg === 90 && r90.b.rotationDeg === 90 && r90.c.rotationDeg === 270 && near(r90.b.position.x, 3.56) && near(r90.b.position.z, 2.5) && near(r90.c.position.x, 2.44), r90);
const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
check('Relative Abstände bleiben erhalten (±1 cm Rundung)', Math.abs(dist(r90.a.position, r90.b.position) - dist(set[0].position, set[1].position)) < 0.011);
const back = rotateFormation(set.map((s) => ({ ...s, ...r90[s.id] })), pivot, -90, room)!;
check('Zurückdrehen: Ausgangslage exakt', set.every((s) => near(back[s.id].position.x, s.position.x, 0.011) && near(back[s.id].position.z, s.position.z, 0.011) && back[s.id].rotationDeg === s.rotationDeg));
const wallSet = [
  { id: 'a', width: 3, depth: 0.6, rotationDeg: 0, position: { x: 3, z: 0.3 } },
  { id: 'b', width: 0.5, depth: 0.5, rotationDeg: 0, position: { x: 3, z: 0.85 } },
];
const nearWall = rotateFormation(wallSet, formationCenter(wallSet), 90, room)!;
check('An der Wand gedreht: Formation wird in den Raum geschoben, alle passen', !!nearWall && wallSet.every((s) => fitsInRoom(room, { ...s, rotationDeg: nearWall[s.id].rotationDeg }, nearWall[s.id].position, true)), nearWall);
const tiny = roomModelOf(createRectangleRoom({ width: 3.2, length: 1.2, height: 2.5 }));
check('Passt in keinem Fall (3 m langes Möbel quer im 1,2 m tiefen Raum) → null', rotateFormation([{ id: 'x', width: 3, depth: 0.6, rotationDeg: 0, position: { x: 1.6, z: 0.6 } }], { x: 1.6, z: 0.6 }, 90, tiny) === null);

// ---------- Gruppen: drehen, benennen, speichern
h = run([add('table')]);
const t = h.present.furniture[0].id;
h = run([{ type: 'updateFurniture', id: t, patch: { width: 1.6, depth: 0.9, position: { x: 2.5, z: 2 } } }, add('chair')], h);
const c1 = h.present.furniture[1].id;
h = run([{ type: 'updateFurniture', id: c1, patch: { position: { x: 2.5, z: 1.44 } } }, add('chair')], h);
const c2 = h.present.furniture[2].id;
h = run([{ type: 'updateFurniture', id: c2, patch: { position: { x: 2.5, z: 2.56 }, rotationDeg: 180 } }, { type: 'groupFurniture', ids: [t, c1, c2] }], h);
check('Essgruppe (Stühle unter dem Tisch): keine Kollision', h.present.groups.length === 1 && hitsOf(h) === 0);
const before = h.past.length;
h = run([{ type: 'rotateFurnitureMany', ids: [t, c1, c2], deltaDeg: 90 }], h);
const ft = h.present.furniture;
check('Gruppe um 90° gedreht: Tisch 90°, Stühle 90°/270°, seitlich am Tisch', ft[0].rotationDeg === 90 && ft[1].rotationDeg === 90 && ft[2].rotationDeg === 270 && near(ft[1].position.z, 2) && near(ft[1].position.x, 3.06), ft.map((f) => [f.position, f.rotationDeg]));
check('Gruppendrehung: ein Schritt „Möbel drehen“, weiterhin keine Kollision', h.past.length === before + 1 && h.past.at(-1)!.label === 'Möbel drehen' && hitsOf(h) === 0);
h = run([{ type: 'history/undo' }], h);
check('Undo: Gruppe in Ausgangslage', h.present.furniture[0].rotationDeg === 0 && near(h.present.furniture[1].position.z, 1.44));
const gid = h.present.groups[0].id;
h = run([{ type: 'renameGroup', groupId: gid, name: 'Essgruppe' }], h);
check('Gruppe benennen: „Essgruppe“, Schritt „Gruppe umbenennen“', h.present.groups[0].name === 'Essgruppe' && h.past.at(-1)!.label === 'Gruppe umbenennen');
h = run([{ type: 'renameGroup', groupId: gid, name: '   ' }], h);
check('Leerer Name → Standardname „Gruppe 1“', h.present.groups[0].name === 'Gruppe 1');
h = run([{ type: 'renameGroup', groupId: gid, name: '  Sitzecke am Fenster mit sehr langem Namen über vierzig Zeichen' }], h);
check('Name: vorne gekürzt, höchstens 40 Zeichen', h.present.groups[0].name.startsWith('Sitzecke') && h.present.groups[0].name.length === 40);
const doc = { ...h.present, room: h.present.room };
const file = { format: 'raumplaner-project', version: 6, id: 'p', name: 'P', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', plan: { room: doc.room, openings: doc.openings, furniture: doc.furniture, fixtures: doc.fixtures, groups: doc.groups, design: doc.design } } as const;
const parsed = parseProject(serializeProject(file as never));
check('Speichern → Laden: Gruppenname erhalten (Format 6, keine Formatänderung nötig)', parsed.ok && parsed.project.plan.groups[0].name === h.present.groups[0].name);
const unnamed = parseProject(JSON.stringify({ ...file, plan: { ...file.plan, groups: [{ id: 'group-1', memberIds: [t, c1] }] } }));
check('Ältere Gruppe ohne Namen bleibt gültig („Gruppe“)', unnamed.ok && unnamed.project.plan.groups[0].name === 'Gruppe');

// ---------- Tischlampe auf Trägern
const item = (type: FurnitureType, x: number, z: number, w: number, d: number, hgt: number, rot = 0): FurnitureItem => ({ id: `${type}-${x}-${z}`, type, name: type, width: w, depth: d, height: hgt, position: { x, z }, rotationDeg: rot });
const lamp = { ...item('table-lamp', 1, 1, 0.28, 0.28, 0.45), elevation: 0.75 };
for (const [type, hgt] of [['nightstand', 0.55], ['desk', 0.75], ['dresser', 0.85], ['sideboard', 0.8], ['table', 0.75], ['coffee-table', 0.45], ['tv-board', 0.5]] as const) {
  const carrier = item(type, 1, 1, 1, 0.5, hgt);
  check(`Träger ${type}: Lampe steht darauf`, supportOf(lamp, [carrier, lamp])?.id === carrier.id);
}
for (const type of ['sofa', 'bed', 'wardrobe', 'chair', 'shelf'] as const) check(`Kein Träger: ${type}`, supportOf(lamp, [item(type, 1, 1, 1, 0.5, 0.5), lamp]) === null);
check('Gedrehter Träger: Mittelpunkt in der gedrehten Grundfläche', supportOf({ ...lamp, position: { x: 1, z: 1.45 } }, [item('desk', 1, 1, 1.4, 0.4, 0.75, 90), lamp]) !== null && supportOf({ ...lamp, position: { x: 1.45, z: 1 } }, [item('desk', 1, 1, 1.4, 0.4, 0.75, 90), lamp]) === null);
check('Nur Tischlampen stehen auf Trägern (Stehlampe nicht)', supportOf(item('floor-lamp', 1, 1, 0.4, 0.4, 1.6), [item('table', 1, 1, 1, 1, 0.75)]) === null);

done();
