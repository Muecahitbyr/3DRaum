import { computeCollisionReport, describeCollisions, furnitureCollide } from '../../src/collision/index.ts';
import { detectCollisions } from '../../src/collision/detect.ts';
import { furnitureColliders } from '../../src/collision/colliders.ts';
import { furnitureZones } from '../../src/collision/furnitureZones.ts';
import { heightRangesOverlap, polygonsOverlap, rectanglePolygon } from '../../src/collision/geometry.ts';
import { COLLISION_RULES } from '../../src/collision/rules.ts';
import type { Collider } from '../../src/collision/types.ts';
import { historyReducer, initialHistoryState } from '../../src/state/history.ts';
import type { FurnitureItem, FurnitureType } from '../../src/types/furniture.ts';
import type { Opening } from '../../src/types/opening.ts';
import type { RoomFixture } from '../../src/types/fixture.ts';
import { computeClearances } from '../../src/utils/furnitureClearance.ts';
import { supportElevations } from '../../src/utils/furnitureSupport.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { createRectangleRoom } from '../../src/utils/room/plan.ts';
import { createSuite } from './harness.ts';

/** Semantisches Kollisionsmodell: Zonen (Platte, Beine, Sitz, Lehne …), Höhen, Drehung, Broad Phase, Abstände. */
const { check, near, done } = createSuite();
const room = roomModelOf(createRectangleRoom({ width: 6, length: 5, height: 2.5 }));
let n = 0;
const item = (type: FurnitureType, x: number, z: number, size: [number, number, number], rotationDeg = 0, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: `furniture-${++n}`, type, name: `${type} ${n}`, width: size[0], depth: size[1], height: size[2], position: { x, z }, rotationDeg, ...extra,
});
const hits = (furniture: FurnitureItem[], openings: Opening[] = [], fixtures: RoomFixture[] = []) =>
  computeCollisionReport(room, openings, furniture, fixtures).hits.map((h) => `${h.rule}:${h.subject.id}/${h.other.id}`);
const TABLE: [number, number, number] = [1.6, 0.9, 0.75]; // x 2,20–3,80, z 2,05–2,95 bei (3; 2,5)
const CHAIR: [number, number, number] = [0.45, 0.52, 0.9];

// ---------- Zonen folgen den Modellen
const table = item('table', 3, 2.5, TABLE);
const zones = furnitureZones(table);
check('Esstisch: Platte + vier Beine (Beine 5 × 5 cm, 7 cm eingerückt, bis Plattenunterkante 0,71)', zones.length === 5 && zones.filter((z) => z.name === 'Bein').length === 4 && near(zones[0].y0, 0.71) && near(zones[1].x1 - zones[1].x0, 0.05) && near(Math.abs(zones[1].x0 + 0.025), 0.73), zones);
check('Stuhl: Unterteil bis Sitzhöhe 0,45, Lehne hinten (−z) bis 0,90', JSON.stringify(furnitureZones(item('chair', 0, 0, CHAIR)).map((z) => [z.name, +z.y0.toFixed(2), +z.y1.toFixed(2)])) === '[["Unterteil",0,0.45],["Lehne",0.45,0.9]]');
check('Schreibtisch: Platte, Wange, Container, Sichtblende', furnitureZones(item('desk', 0, 0, [1.4, 0.7, 0.75])).map((z) => z.name).join() === 'Platte,Wange,Container,Sichtblende');
check('Sofa, Schrank, Couchtisch: ein fester Quader', ['sofa', 'wardrobe', 'coffee-table'].every((t) => furnitureZones(item(t as FurnitureType, 0, 0, [1, 1, 1])).length === 1));

// ---------- Stuhl und Esstisch
// Stuhl schaut zum Tisch (+z), 15 cm unter die Platte geschoben: z 1,68–2,20; Lehne z 1,68–1,72.
const chairIn = item('chair', 3, 1.94, CHAIR);
check('Stuhl teilweise unter dem Esstisch → erlaubt', hits([table, chairIn]).length === 0, hits([table, chairIn]));
const chairDeep = item('chair', 3, 2.3, CHAIR); // Lehne z 2,04–2,08 unter der Platte
check('Stuhl so weit darunter, dass die Lehne unter die Platte ragt → Konflikt', JSON.stringify(hits([table, chairDeep])) === `["furniture-overlap:${table.id}/${chairDeep.id}"]` || JSON.stringify(hits([table, chairDeep])) === `["furniture-overlap:${chairDeep.id}/${table.id}"]`, hits([table, chairDeep]));
const chairLeg = item('chair', 2.3, 1.94, CHAIR); // überdeckt das Bein bei x 2,25–2,30
check('Stuhl durch ein Tischbein → weiterhin Konflikt', hits([table, chairLeg]).length === 1, hits([table, chairLeg]));
const chairBack = item('chair', 3, 3.06, CHAIR, 180); // von der anderen Seite, gedreht
check('Stuhl von der anderen Seite (180°) unter dem Tisch → erlaubt', hits([table, chairBack]).length === 0, hits([table, chairBack]));
const twoChairs = [item('chair', 2.8, 1.94, CHAIR), item('chair', 3.2, 1.94, CHAIR)];
check('Zwei Stühle überdecken sich → Konflikt (auch unter dem Tisch)', hits([table, ...twoChairs]).length === 1);
const lowTable = item('table', 3, 2.5, [1.6, 0.9, 0.42]);
check('Niedriger Tisch (0,42 m): Sitz passt nicht unter die Platte → Konflikt', hits([lowTable, item('chair', 3, 1.94, CHAIR)]).length === 1);
// Gedreht: Tisch 90°, Stuhl kommt von links (Front zeigt nach +x → 90° im Uhrzeigersinn = 270°?)
const tableR = item('table', 3, 2.5, TABLE, 90); // x 2,55–3,45, z 1,70–3,30
const chairR = item('chair', 2.55 - 0.26 + 0.15, 2.5, CHAIR, 270); // Front (+z lokal) zeigt nach +x
const chairRZones = furnitureColliders(chairR, room).filter((c) => c.part === 'Lehne')[0];
check('Gedreht (Tisch 90°, Stuhl 270°): Lehne liegt links außen', Math.max(...chairRZones.footprint.map((p) => p.x + room.origin.x)) < 2.55, chairRZones.footprint);
check('Gedreht: Stuhl unter dem gedrehten Tisch → erlaubt', hits([tableR, chairR]).length === 0, hits([tableR, chairR]));
const chairRWrong = item('chair', 2.55 - 0.26 + 0.15, 2.5, CHAIR, 90); // falsch herum: Lehne unter dem Tisch
check('Gedreht falsch herum (Lehne unter der Platte) → Konflikt', hits([tableR, chairRWrong]).length === 1);

// ---------- Bürostuhl und Schreibtisch
const desk = item('desk', 3, 1, [1.4, 0.7, 0.75]); // x 2,30–3,70, z 0,65–1,35; Container x 3,28–3,70
const officeIn = item('office-chair', 2.8, 1.475, [0.65, 0.65, 1.1], 180);
check('Bürostuhl teilweise unter dem Schreibtisch (Armlehnen 0,71 < Platte 0,72) → erlaubt', hits([desk, officeIn]).length === 0, hits([desk, officeIn]));
const officeHigh = item('office-chair', 2.8, 1.475, [0.65, 0.65, 1.35], 180);
check('Bürostuhl mit zu hohen Armlehnen (0,78 m) → Konflikt', hits([desk, officeHigh]).length === 1);
const officePedestal = item('office-chair', 3.4, 1.475, [0.65, 0.65, 1.1], 180);
check('Bürostuhl gegen den Schubladen-Container → Konflikt', hits([desk, officePedestal]).length === 1);
const dresserUnder = item('dresser', 2.8, 1.0, [0.45, 0.5, 0.6]);
check('Niedriger Rollcontainer (0,60) unter der Platte zwischen Wange und Container → keine Kollision', hits([desk, dresserUnder]).length === 0, hits([desk, dresserUnder]));

// Mehrere Zonenpaare in unterschiedlicher Reihenfolge (Bein ↔ Sitz, Platte ↔ Lehne): genau EIN Treffer je Möbelpaar.
for (const [label, x, z] of [['links', 2.3, 2.3], ['rechts', 3.7, 2.3], ['Ecke', 3.75, 2.9]] as const) {
  const chair = item('chair', x, z, CHAIR);
  const pair = computeCollisionReport(room, [], [chair, table]);
  const messages = describeCollisions({ type: 'furniture', id: chair.id }, pair, (r) => r.id);
  check(`Stuhl in Bein und Platte (${label}): genau ein Treffer und eine Meldung`, pair.hits.length === 1 && messages.length === 1, JSON.stringify({ hits: pair.hits.length, messages }));
}

// Ein Möbel mit mehreren Gegenübern: EINE Meldung, unabhängig von der Reihenfolge der Treffer.
{
  const middle = item('table', 3, 2.5, TABLE);
  const left = item('sofa', 2.2, 2.5, [1, 0.9, 0.85]);
  const right = item('wardrobe', 3.8, 2.5, [1, 0.6, 2]);
  for (const order of [[left, middle, right], [right, middle, left], [middle, left, right]]) {
    const messages = describeCollisions({ type: 'furniture', id: middle.id }, computeCollisionReport(room, [], order), (r) => (r.id === left.id ? 'Sofa' : 'Schrank'));
    check(`Mehrere Gegenüber in einer Meldung (Reihenfolge ${order.map((o) => o.type).join('/')})`, messages.length === 1 && /mit (Sofa und Schrank|Schrank und Sofa)\./.test(messages[0].text), messages);
  }
}

// ---------- Feste Möbel bleiben feste Körper
const sofa = item('sofa', 3, 2.9, [2, 0.9, 0.85]);
check('Sofa ↔ Esstisch bei echter Überschneidung → Konflikt (genau eine Meldung, obwohl Platte und Beine getroffen)', hits([table, sofa]).length === 1, hits([table, sofa]));
const sofaBeside = item('sofa', 3, 3.4, [2, 0.9, 0.85]); // z 2,95–3,85: Kante an Kante
check('Sofa Kante an Kante am Tisch → keine Kollision', hits([table, sofaBeside]).length === 0);
const bed = item('double-bed', 2, 2.5, [2.1, 1.8, 0.5]);
const wardrobe = item('wardrobe', 2.8, 2.5, [1.5, 0.6, 2]);
check('Schrank ↔ Bett → Konflikt', hits([bed, wardrobe]).length === 1);
const pendant = item('pendant-light', 3, 2.5, [0.4, 0.4, 0.9]);
check('Pendelleuchte über dem Tisch (unterschiedliche Höhen) → keine Kollision', hits([table, pendant]).length === 0);
const ceiling = item('ceiling-light', 2.8, 2.5, [0.45, 0.45, 0.12]);
check('Deckenleuchte über dem Kleiderschrank (2,38 > 2,00) → keine Kollision', hits([wardrobe, ceiling]).length === 0);

// ---------- Tischlampe: steht auf dem Träger
const night = item('nightstand', 1, 1, [0.45, 0.4, 0.55]);
const lamp = item('table-lamp', 1, 1, [0.28, 0.28, 0.45], 0, { elevation: 0.75 });
check('Tischlampe über dem Nachttisch: steht auf 0,55 m', supportElevations([night, lamp], 2.5).get(lamp.id) === 0.55);
check('Tischlampe auf dem Nachttisch → keine Kollision', hits([night, lamp]).length === 0);
const dresser = item('dresser', 4, 1, [1, 0.45, 0.85]);
const lampOnDresser = item('table-lamp', 4, 1, [0.28, 0.28, 0.45], 0, { elevation: 0.75 });
check('Tischlampe über der Kommode (0,85 m, Standhöhe gespeichert 0,75): steht darauf, keine Kollision', supportElevations([dresser, lampOnDresser], 2.5).get(lampOnDresser.id) === 0.85 && hits([dresser, lampOnDresser]).length === 0);
const lampBeside = { ...lampOnDresser, position: { x: 4.8, z: 1 } };
check('Neben der Kommode: wieder gespeicherte Standhöhe (kein Träger)', !supportElevations([dresser, lampBeside], 2.5).has(lampBeside.id));
const lampOnSofa = item('table-lamp', 3, 2.9, [0.28, 0.28, 0.45]);
check('Sofa ist kein Träger', !supportElevations([sofa, lampOnSofa], 2.5).has(lampOnSofa.id));

// ---------- Heizkörper und Türschwenk (wie bisher)
const radiator: RoomFixture = { id: 'fixture-1', type: 'radiator', wall: 'north', offset: 2.5, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 };
const tableOverRadiator = item('table', 3, 0.5, TABLE); // z 0,05–0,95: Platte über dem Heizkörper (z 0–0,10)
check('Tisch über dem Heizkörper (Platte staut die Wärme) → „radiator-covered“ wie bisher', hits([tableOverRadiator], [], [radiator]).some((h) => h.startsWith('radiator-covered')), hits([tableOverRadiator], [], [radiator]));
const chairAtRadiator = item('chair', 3, 0.35, CHAIR);
check('Stuhl vor dem Heizkörper → Konflikt', hits([chairAtRadiator], [], [radiator]).some((h) => h.startsWith('radiator-covered')));
check('Möbel mit Abstand zum Heizkörper → keine Meldung', hits([item('chair', 3, 0.5, CHAIR)], [], [radiator]).length === 0);
const door: Opening = { id: 'opening-1', type: 'door', wall: 'south', offset: 2.55, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' };
const chairInSwing = item('chair', 3, 4.6, CHAIR); // Südwand-Tür x 2,55–3,45, Schwenk bis z 4,10
check('Stuhl im Türschwenkbereich → Konflikt „door-swing“', hits([chairInSwing], [door]).some((h) => h.startsWith('door-swing')), hits([chairInSwing], [door]));
check('Tischplatte im Türschwenkbereich → Konflikt', hits([item('table', 3, 4.3, TABLE)], [door]).some((h) => h.startsWith('door-swing')));
const passage: Opening = { id: 'opening-2', type: 'passage', wall: 'east', offset: 2, width: 1, height: 2.1 };
check('Durchgang: kein Schwenkbereich (Möbel davor ohne Meldung)', hits([item('chair', 5.6, 2.5, CHAIR)], [passage]).length === 0);

// ---------- Gruppen ändern die Kollisionsgeometrie nicht
let h = historyReducer(initialHistoryState, { type: 'setRoomDimension', key: 'width', value: 6 });
h = historyReducer(h, { type: 'setRoomDimension', key: 'length', value: 5 });
h = historyReducer(h, { type: 'addFurniture', furnitureType: 'table' });
const tId = h.present.furniture[0].id;
h = historyReducer(h, { type: 'updateFurniture', id: tId, patch: { width: 1.6, depth: 0.9, position: { x: 3, z: 2.5 } } });
h = historyReducer(h, { type: 'addFurniture', furnitureType: 'chair' });
const cId = h.present.furniture[1].id;
h = historyReducer(h, { type: 'updateFurniture', id: cId, patch: { position: { x: 3, z: 1.94 }, rotationDeg: 0 } });
h = historyReducer(h, { type: 'groupFurniture', ids: [tId, cId] });
const report = () => computeCollisionReport(roomModelOf(h.present.room), [], h.present.furniture).hits.length;
check('Gruppe Tisch + Stuhl (Stuhl unter dem Tisch): keine Kollision', h.present.groups.length === 1 && report() === 0);
h = historyReducer(h, { type: 'moveFurniture', ids: [tId, cId], delta: { x: -1, z: 0.5 } });
check('Gruppe verschoben: relative Lage gleich, weiterhin keine Kollision', report() === 0 && near(h.present.furniture[1].position.x, 2));

// ---------- Broad Phase = vollständige Paarprüfung (Referenz)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const types: FurnitureType[] = ['table', 'chair', 'desk', 'office-chair', 'sofa', 'wardrobe', 'nightstand', 'table-lamp', 'ceiling-light'];
const crowd = Array.from({ length: 120 }, (_, i) => item(types[i % types.length], 0.5 + rand() * 5, 0.5 + rand() * 4, [0.4 + rand() * 1.2, 0.4 + rand() * 0.8, 0.4 + rand() * 1.5], Math.round(rand() * 8) * 45));
const support = supportElevations(crowd, 2.5);
const colliders: Collider[] = crowd.flatMap((f) => furnitureColliders(f, room, support.get(f.id)));
const naive = new Set<string>();
for (let i = 0; i < colliders.length; i++) for (let j = i + 1; j < colliders.length; j++) {
  const a = colliders[i], b = colliders[j];
  if (a.owner.id === b.owner.id) continue;
  const rule = COLLISION_RULES.find((r) => (r.kinds[0] === a.kind && r.kinds[1] === b.kind) || (r.kinds[0] === b.kind && r.kinds[1] === a.kind));
  if (!rule || !heightRangesOverlap(a.height, b.height, 1e-4) || !polygonsOverlap(a.footprint, b.footprint, 1e-4)) continue;
  naive.add([rule.id, ...[a.owner.id, b.owner.id].sort()].join('|'));
}
const fast = new Set(detectCollisions(colliders).hits.map((x) => [x.rule, ...[x.subject.id, x.other.id].sort()].join('|')));
check(`Broad Phase findet exakt dieselben Kollisionen wie die vollständige Prüfung (${naive.size})`, naive.size > 10 && naive.size === fast.size && [...naive].every((k) => fast.has(k)));

// ---------- Leistung: 150 Möbel, ein Möbel bewegt sich
const many = Array.from({ length: 150 }, (_, i) => item(types[i % types.length], 0.4 + (i % 15) * 0.37, 0.4 + Math.floor(i / 15) * 0.42, [0.35, 0.35, 0.5 + (i % 3) * 0.3]));
const time = (fn: () => void) => { const t = performance.now(); fn(); return performance.now() - t; };
computeCollisionReport(room, [], many);
const cold = time(() => computeCollisionReport(room, [], many.map((f) => ({ ...f }))));
const moved = many.map((f, i) => (i === 40 ? { ...f, position: { x: f.position.x + 0.05, z: f.position.z } } : f));
const warm = Math.min(...Array.from({ length: 5 }, () => time(() => computeCollisionReport(room, [], moved))));
check(`150 Möbel: Bericht ohne Zwischenspeicher < 40 ms (${cold.toFixed(1)} ms)`, cold < 40);
check(`150 Möbel, eines bewegt (Zonen der übrigen zwischengespeichert) < 15 ms (${warm.toFixed(1)} ms)`, warm < 15);

// ---------- Abstandsmaße: geometrischer Abstand ≠ erlaubte Überdeckung ≠ Kollision
const clear = computeClearances(chairIn, [table, chairIn], room);
check('Abstände: Stuhl unter dem Tisch zeigt keine „Überschneidung“', clear.every((c) => !c.conflict), clear.map((c) => `${c.direction}:${c.conflict}`));
const chairGap = item('chair', 3, 1.69, CHAIR); // Vorderkante 1,95 → 10 cm vor dem Tisch
const gap = computeClearances(chairGap, [table, chairGap], room).find((c) => c.direction === 'down')!;
check('Abstände: Stuhl 10 cm vor dem Tisch → geometrischer Abstand 10 cm zum Tisch', near(gap.distance, 0.1, 1e-6) && gap.target.kind === 'furniture', gap);
const conflict = computeClearances(chairDeep, [table, chairDeep], room);
check('Abstände: echte Kollision bleibt „Überschneidung“', conflict.some((c) => c.conflict));
check('furnitureCollide: Stuhl unter Tisch nein, Sofa im Tisch ja', !furnitureCollide(chairIn, table, room) && furnitureCollide(sofa, table, room));
check('Rechteck-Hilfsfunktion unverändert (Grundfläche)', rectanglePolygon({ x: 0, z: 0 }, 1, 0.5, 0)[2].x === 1);

done();
