import { computeCollisionReport } from '../../src/collision/index.ts';
import { furnitureZones } from '../../src/collision/furnitureZones.ts';
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, FURNITURE_TYPES } from '../../src/config/furniture.ts';
import { stackedLabelShifts } from '../../src/export/planImage.ts';
import { WALL_FINISHES } from '../../src/config/design.ts';
import { filterLibrary } from '../../src/components/library/libraryFilter.ts';
import { parseProject, PROJECT_FORMAT_VERSION, serializeProject } from '../../src/projects/format.ts';
import { historyReducer, initialHistoryState, type HistoryState } from '../../src/state/history.ts';
import type { PlannerAction } from '../../src/state/plannerState.ts';
import type { FurnitureItem, FurnitureType } from '../../src/types/furniture.ts';
import { computeClearances } from '../../src/utils/furnitureClearance.ts';
import { furnitureBaseY } from '../../src/utils/furniture.ts';
import { furniturePlanDetails } from '../../src/utils/furniturePlan.ts';
import { supportElevations } from '../../src/utils/furnitureSupport.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { createRectangleRoom } from '../../src/utils/room/plan.ts';
import type { Opening } from '../../src/types/opening.ts';
import { createFixture } from '../../src/utils/fixtures.ts';
import { createSuite } from './harness.ts';

/** Küche, Bad, Teppich, Pflanze: Katalog, Suche, Kollisionen (Teppich, Oberschrank), Platzsuche, Format 7. */
const { check, near, done } = createSuite();
const room = roomModelOf(createRectangleRoom({ width: 5, length: 4, height: 2.5 }));
const NEW: FurnitureType[] = ['kitchen-base', 'kitchen-wall', 'kitchen-tall', 'kitchen-sink', 'kitchen-stove', 'fridge', 'kitchen-island', 'toilet', 'washbasin', 'shower', 'bathtub', 'rug', 'plant'];
let n = 0;
const item = (type: FurnitureType, x: number, z: number, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: `furniture-${++n}`, type, name: type, ...FURNITURE_CATALOG[type].defaultSize, position: { x, z }, rotationDeg: 0,
  ...(FURNITURE_CATALOG[type].elevation ? { elevation: FURNITURE_CATALOG[type].elevation!.default } : {}), ...extra,
});
const hits = (furniture: FurnitureItem[]) => computeCollisionReport(room, [], furniture).hits.length;

// ---------- Katalog
check('32 Möbeltypen (19 + 13 neue)', FURNITURE_TYPES.length === 32 && NEW.every((t) => FURNITURE_TYPES.includes(t)));
check('Kategorien „Küche“ (7) und „Bad“ (4)', FURNITURE_CATEGORIES.find((c) => c.id === 'kitchen')?.types.length === 7 && FURNITURE_CATEGORIES.find((c) => c.id === 'bath')?.types.length === 4);
const S = (t: FurnitureType) => FURNITURE_CATALOG[t].defaultSize;
check('Realistische Standardmaße (Unterschrank 60×60×90, Oberschrank 60×35×70, Hochschrank 60×60×200, Kühlschrank 60×65×200)',
  JSON.stringify([S('kitchen-base'), S('kitchen-wall'), S('kitchen-tall'), S('fridge')].map((s) => [s.width, s.depth, s.height])) === '[[0.6,0.6,0.9],[0.6,0.35,0.7],[0.6,0.6,2],[0.6,0.65,2]]');
check('Bad: WC 40×70, Waschtisch 80×50, Dusche 90×90, Badewanne 170×75', JSON.stringify([S('toilet'), S('washbasin'), S('shower'), S('bathtub')].map((s) => [s.width, s.depth])) === '[[0.4,0.7],[0.8,0.5],[0.9,0.9],[1.7,0.75]]');
for (const type of NEW) {
  const def = FURNITURE_CATALOG[type];
  const s = def.defaultSize;
  const inLimits = (['width', 'depth', 'height'] as const).every((k) => s[k] >= def.limits[k][0] && s[k] <= def.limits[k][1]);
  check(`${def.label}: Standardmaße in den Grenzen, Farbe wählbar, Plansymbol mit Details`, inLimits && (def.colorSlots?.length ?? 0) >= 1 && furniturePlanDetails(type, s).length >= 1);
}

// ---------- Suche (Normalisierung inkl. Umlaute)
const finds = (query: string, type: FurnitureType) => filterLibrary('all', query).includes(type);
const searches: [string, FurnitureType][] = [
  ['Küche', 'kitchen-base'], ['kuche', 'kitchen-island'], ['Schrank', 'kitchen-wall'], ['Spüle', 'kitchen-sink'], ['spule', 'kitchen-sink'], ['Herd', 'kitchen-stove'],
  ['Ofen', 'kitchen-stove'], ['Kühlschrank', 'fridge'], ['Insel', 'kitchen-island'], ['WC', 'toilet'], ['Toilette', 'toilet'], ['Waschbecken', 'washbasin'],
  ['Dusche', 'shower'], ['Wanne', 'bathtub'], ['Teppich', 'rug'], ['Pflanze', 'plant'], ['Bad', 'bathtub'],
];
for (const [q, t] of searches) check(`Suche „${q}“ findet ${FURNITURE_CATALOG[t].label}`, finds(q, t));

// ---------- Teppich: liegt unter Möbeln
const rug = item('rug', 2.5, 2);
const sofa = item('sofa', 2.5, 2);
check('Teppich: keine Kollisionszonen', furnitureZones(rug).length === 0);
check('Teppich unter Sofa, Couchtisch und Bett → keine Kollision', hits([rug, sofa, item('coffee-table', 2.5, 2.4), item('double-bed', 2.4, 1.8)].slice(0, 2)) === 0 && hits([rug, item('coffee-table', 2.5, 2.4)]) === 0);
check('Teppich ↔ Teppich → keine Kollision', hits([rug, item('rug', 2.6, 2.1)]) === 0);
const door = { id: 'opening-1', type: 'door', wall: 'south', offset: 2, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' } as const;
check('Teppich im Türschwenk → keine Meldung (Tür schwenkt darüber)', computeCollisionReport(room, [door], [item('rug', 2.5, 3.5, { width: 1.2, depth: 0.8 })]).hits.length === 0);
const sofaClear = computeClearances(sofa, [rug, sofa], room);
check('Abstände: Teppich ist kein Hindernis (Sofa misst bis zur Wand)', sofaClear.every((c) => c.target.kind === 'wall' && !c.conflict));
check('Sofa ↔ Sofa weiterhin Kollision (Teppich ändert nichts)', hits([rug, sofa, item('sofa', 2.6, 2)]) === 1);

// ---------- Küchenoberschrank: Höhenvergleich
const base = item('kitchen-base', 1, 0.3);
const wall = item('kitchen-wall', 1, 0.175);
check('Oberschrank hängt (Unterkante 1,45 m), steht nicht auf dem Unterschrank', furnitureBaseY(wall, 2.5) === 1.45 && !supportElevations([base, wall], 2.5).has(wall.id));
check('Unterschrank unter Oberschrank → zulässig (Höhen 0–0,90 und 1,45–2,15)', hits([base, wall]) === 0);
check('Oberschrank ↔ Hochschrank daneben überlappend → Konflikt', hits([wall, item('kitchen-tall', 1.3, 0.3)]) === 1);
check('Oberschrank ↔ Kühlschrank → Konflikt', hits([wall, item('fridge', 1.2, 0.33)]) === 1);
check('Oberschrank zu tief gehängt (Standhöhe 0,8) → Konflikt mit dem Unterschrank', hits([base, { ...wall, elevation: 0.8 }]) === 1);
check('Unterschrank ↔ Unterschrank überlappend → Konflikt (feste Möbel)', hits([base, item('kitchen-base', 1.3, 0.3)]) === 1);
check('Kein Kontaktschatten-/Trägerfehler: Tischlampe auf dem Unterschrank steht auf 0,90', supportElevations([base, item('table-lamp', 1, 0.3, { elevation: 0.75 })], 2.5).get(`furniture-${n}`) === 0.9);

// ---------- Platzsuche: Wandmöbel an die Wand, große Möbel ohne Kollision
const run = (actions: PlannerAction[], start: HistoryState = initialHistoryState) => actions.reduce(historyReducer, start);
const add = (type: FurnitureType) => ({ type: 'addFurniture', furnitureType: type }) as PlannerAction;
let h = run([add('kitchen-base'), add('kitchen-base'), add('kitchen-base')]);
const bases = h.present.furniture;
check('Drei Unterschränke: an der Nordwand (längste Wand), Rückseite zur Wand, nebeneinander', bases.every((f) => near(f.position.z, 0.3) && f.rotationDeg === 0) && new Set(bases.map((f) => f.position.x)).size === 3, bases.map((f) => [f.position, f.rotationDeg]));
check('Unterschränke reihen sich lückenlos (Abstand 60 cm)', (() => { const xs = bases.map((f) => f.position.x).sort((a, b) => a - b); return near(xs[1] - xs[0], 0.6, 0.26) && near(xs[2] - xs[1], 0.6, 0.26); })(), bases.map((f) => f.position.x));
h = run([add('kitchen-wall')], h);
const wallCab = h.present.furniture.at(-1)!;
// Positionen sind cm-genau: Mitte 17,5 cm → 18 cm (Rückseite 5 mm vor der Wand).
check('Oberschrank: an der Wand über den Unterschränken (keine Kollision)', near(wallCab.position.z, 0.175, 0.0051) && computeCollisionReport(roomModelOf(h.present.room), [], h.present.furniture).hits.length === 0, wallCab.position);
for (const type of ['bathtub', 'shower', 'kitchen-island', 'kitchen-tall', 'fridge'] as FurnitureType[]) {
  h = run([add(type)], h);
  const placed = h.present.furniture.at(-1)!;
  check(`${FURNITURE_CATALOG[type].label}: freier Platz ohne Kollision`, computeCollisionReport(roomModelOf(h.present.room), [], h.present.furniture).hits.length === 0, [placed.position, placed.rotationDeg]);
}
const bath = run([add('bathtub')]).present.furniture[0];
check('Badewanne im leeren Raum: an der längsten Wand, längs zur Wand', near(bath.position.z, 0.375, 0.0051) && bath.rotationDeg === 0, [bath.position, bath.rotationDeg]);
const narrow = run([{ type: 'setRoomDimension', key: 'width', value: 2 }, { type: 'setRoomDimension', key: 'length', value: 3 }, add('bathtub')]).present.furniture[0];
check('Schmales Bad (2 × 3): Badewanne an der Längswand (90°/270°)', [90, 270].includes(narrow.rotationDeg), [narrow.position, narrow.rotationDeg]);

// ---------- Wandfliesen und Format 7
check('Wandoberfläche „Fliesen“ vorhanden (glänzender als Matt)', WALL_FINISHES.tiles.label === 'Fliesen' && WALL_FINISHES.tiles.roughness < WALL_FINISHES.matte.roughness);
check('Projektformat 7', PROJECT_FORMAT_VERSION === 7);
const plan = { ...h.present, design: { ...h.present.design, wallFinishes: { north: 'tiles' } } };
const file = { format: 'raumplaner-project', version: 7, id: 'k', name: 'Küche', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', plan: { room: plan.room, openings: [], furniture: plan.furniture, fixtures: [], groups: [], design: plan.design } };
const roundtrip = parseProject(serializeProject(file as never));
check('Speichern → Laden: alle neuen Typen und Fliesen erhalten', roundtrip.ok && roundtrip.project.plan.furniture.length === plan.furniture.length && roundtrip.project.plan.design.wallFinishes.north === 'tiles' && roundtrip.warnings.length === 0, roundtrip.ok ? roundtrip.warnings : roundtrip);
const v6 = parseProject(JSON.stringify({ ...file, version: 6, plan: { ...file.plan, furniture: [item('sofa', 2, 2)], design: { ...plan.design, wallFinishes: {} } } }));
check('Version 6 → 7: unverändert lesbar, auf 7 gehoben', v6.ok && v6.project.version === 7 && v6.warnings.length === 0);
const withRug = parseProject(JSON.stringify({ ...file, plan: { ...file.plan, furniture: [{ ...item('rug', 2, 2), height: 0.5 }] } }));
check('Teppich: Höhe auf 0,5–3 cm begrenzt', withRug.ok && withRug.project.plan.furniture[0].height === 0.03);

// ---------- Endabnahme: Beschriftung Ober-/Unterschrank im Grundriss-PNG
// Küchenzeile an der linken Wand (270°): Mittelpunkte nur 12,5 cm quer versetzt – waagerechte
// Texte lagen deckungsgleich. Jetzt: Oberschrank eine halbe Zeile höher, Schrank darunter tiefer.
const sink = { ...item('kitchen-sink', 0.3, 5.22), width: 0.8, depth: 0.6, height: 0.9, rotationDeg: 270 };
const hanging = { ...item('kitchen-wall', 0.175, 5.22), id: 'oben', width: 0.6, depth: 0.35, height: 0.7, rotationDeg: 270, elevation: 1.45 };
const lone = { ...item('kitchen-wall', 0.175, 2), id: 'allein', width: 0.6, depth: 0.35, height: 0.7, rotationDeg: 270, elevation: 1.45 };
const shifts = stackedLabelShifts([sink, hanging, lone] as FurnitureItem[]);
check('PNG-Beschriftung: Oberschrank über Spüle → oben/unten getrennt', shifts.get('oben') === -1 && shifts.get(sink.id) === 1, [...shifts]);
check('PNG-Beschriftung: frei hängender Oberschrank bleibt mittig', !shifts.has('allein'));

// ---------- Endabnahme: neue Raumobjekte nicht in Öffnungen (dort fehlt die Wand)
const fixtureRoom = roomModelOf(createRectangleRoom({ width: 5, length: 4, height: 2.5 }));
const doorSouth = { id: 'o1', type: 'door', wall: 'south', offset: 2.05, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' } as Opening;
const passageEast = { id: 'o2', type: 'passage', wall: 'east', offset: 1, width: 2, height: 2.1 } as Opening;
const windowNorth = { id: 'o3', type: 'window', wall: 'north', offset: 1.5, width: 2, height: 1.2, sillHeight: 0.9, sashes: 2 } as Opening;
const inside = (f: { offset: number; width: number }, o: Opening) => f.offset < o.offset + o.width && f.offset + f.width > o.offset;
const sw = createFixture('switch', 'f1', [], fixtureRoom, [doorSouth]);
check('Lichtschalter: Südwand, aber neben der Tür (nicht in der Öffnung)', sw.wall === 'south' && !inside(sw, doorSouth), sw);
const so = createFixture('socket', 'f2', [], fixtureRoom, [passageEast]);
check('Steckdose: Ostwand, aber neben dem Durchgang', so.wall === 'east' && !inside(so, passageEast), so);
const ra = createFixture('radiator', 'f3', [], fixtureRoom, [windowNorth]);
check('Heizkörper unter der Fensterbrüstung bleibt erlaubt (Nordwand mittig)', ra.wall === 'north' && ra.offset === 2, ra);
const full = { id: 'o4', type: 'passage', wall: 'east', offset: 0, width: 4, height: 2.1 } as Opening;
check('Wand ganz offen → nächste bevorzugte Wand', createFixture('socket', 'f4', [], fixtureRoom, [full]).wall === 'south');

done();
