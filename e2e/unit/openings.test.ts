import { openingColliders } from '../../src/collision/colliders.ts';
import { detectCollisions } from '../../src/collision/detect.ts';
import { historyReducer, initialHistoryState } from '../../src/state/history.ts';
import type { Opening } from '../../src/types/opening.ts';
import { createOpening, getOpeningLimits, normalizeOpening } from '../../src/utils/openings.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { offsetForReadingDistance, readingDistances } from '../../src/utils/room/measurements.ts';
import { createFreeRoom, createRectangleRoom } from '../../src/utils/room/plan.ts';
import { parseProject, PROJECT_FORMAT_VERSION, serializeProject } from '../../src/projects/format.ts';
import { createSuite } from './harness.ts';

/** Öffnungen: Durchgang (Grenzen, Kollision, Verlauf), Positionseingabe über Lagemaße, Format v6 und Migration. */
const { check, near, done } = createSuite();
const room = roomModelOf(createRectangleRoom({ width: 5, length: 4, height: 2.5 }));

// ---------- Durchgang: Anlegen, Grenzen, Normalisierung
const passage = createOpening('passage', 'opening-1', [], room);
check('Durchgang: Standard 1,00 × 2,10 m, keine Tür-/Fensterfelder', passage.type === 'passage' && passage.width === 1 && passage.height === 2.1 && !('hinge' in passage) && !('sillHeight' in passage), passage);
check('Durchgang: bevorzugt Ostwand, mittig', passage.wall === 'east' && passage.offset === 1.5, passage);
const limits = getOpeningLimits(passage, room);
check('Durchgang: Grenzen Breite 0,50–4,00 (Wandlänge), Höhe 1,50–2,50 (Raumhöhe)', limits.width.min === 0.5 && limits.width.max === 4 && limits.height.min === 1.5 && limits.height.max === 2.5 && !limits.sillHeight, limits);
const clamped = normalizeOpening({ ...passage, width: 9, height: 9, offset: 3 }, room);
check('Durchgang: zu groß → auf Wand begrenzt (4,00 × 2,50, Position 0)', clamped.width === 4 && clamped.height === 2.5 && clamped.offset === 0, clamped);
const narrow = normalizeOpening({ ...passage, width: 0.1 }, room);
check('Durchgang: Mindestbreite 0,50', narrow.width === 0.5);
const door = createOpening('door', 'opening-2', [passage], room);
const window = createOpening('window', 'opening-3', [passage, door], room);
check('Tür und Fenster unverändert (Südwand-Tür mit Anschlag, Nordwand-Fenster mit Brüstung)', door.type === 'door' && door.wall === 'south' && door.hinge === 'right' && window.type === 'window' && window.wall === 'north' && window.sillHeight === 0.9);

// ---------- Kollision: Durchgang ohne Schwenkbereich und Fensterzone
const kinds = (o: Opening) => openingColliders(o, room).map((c) => c.kind).join(',');
check('Durchgang: nur Wandspanne (keine Tür-/Fensterkollision)', kinds(passage) === 'openingSpan');
check('Tür: Spanne + Schwenkbereich, Fenster: Spanne + Fensterzone', kinds(door) === 'openingSpan,doorSwing' && kinds(window) === 'openingSpan,windowZone');
const overlap = detectCollisions([...openingColliders(passage, room), ...openingColliders({ ...passage, id: 'opening-9', offset: 2 }, room)]);
check('Zwei überlappende Durchgänge: bestehende Warnung „opening-overlap“', overlap.hits.length === 1 && overlap.hits[0].rule === 'opening-overlap');

// ---------- Verlauf: Hinzufügen, Verschieben, Maße, Löschen
let h = historyReducer(initialHistoryState, { type: 'addOpening', openingType: 'passage' });
const id = h.present.openings[0].id;
check('Verlauf: „Durchgang hinzufügen“, Auswahl auf dem Durchgang', h.past.at(-1)?.label === 'Durchgang hinzufügen' && h.present.selection?.kind === 'opening');
h = historyReducer(h, { type: 'updateOpening', id, patch: { offset: 0.4 } });
check('Verlauf: „Durchgang verschieben“', h.past.at(-1)?.label === 'Durchgang verschieben' && h.present.openings[0].offset === 0.4);
h = historyReducer(h, { type: 'updateOpening', id, patch: { width: 1.6 } });
check('Verlauf: „Durchgangsmaße ändern“', h.past.at(-1)?.label === 'Durchgangsmaße ändern');
h = historyReducer(h, { type: 'removeOpening', id });
check('Verlauf: „Durchgang löschen“, Auswahl aufgehoben', h.past.at(-1)?.label === 'Durchgang löschen' && h.present.openings.length === 0 && h.present.selection === null);
h = historyReducer(h, { type: 'history/undo' });
check('Undo stellt den Durchgang wieder her', h.present.openings.length === 1 && h.present.openings[0].type === 'passage' && h.present.openings[0].width === 1.6);

// ---------- Direkte Maßeingabe (ein Schritt, gleiche Positionslogik)
h = historyReducer(initialHistoryState, { type: 'addOpening', openingType: 'door' }); // Südwand
const doorId = h.present.openings[0].id;
const south = roomModelOf(h.present.room).wallById.get('south')!;
const steps = h.past.length;
h = historyReducer(h, { type: 'updateOpening', id: doorId, patch: { offset: offsetForReadingDistance(south, 0.9, 'start', 0.8) } });
const placed = h.present.openings[0];
check('„Abstand links 80 cm“ an der Südwand: links 0,80, intern Abstand ab Wandanfang 3,30', near(readingDistances(south, placed).start, 0.8) && placed.offset === 3.3, placed);
check('Eingabe = genau ein Verlaufsschritt „Tür verschieben“', h.past.length === steps + 1 && h.past.at(-1)!.label === 'Tür verschieben');
h = historyReducer(h, { type: 'updateOpening', id: doorId, patch: { offset: offsetForReadingDistance(south, 0.9, 'end', 99) } });
check('Zu großer Abstand: auf die Wand begrenzt (Tür an der linken Ecke)', h.present.openings[0].offset === 4.1 && near(readingDistances(south, h.present.openings[0]).start, 0));

const free = roomModelOf(createFreeRoom(2.5));
const diagonal = free.walls.find((w) => w.facing === null)!;
const onDiagonal = normalizeOpening({ ...createOpening('window', 'w', [], free), wall: diagonal.id, offset: offsetForReadingDistance(diagonal, 1.2, 'end', 0.25) } as Opening, free);
const rest = readingDistances(diagonal, onDiagonal).end;
check('Diagonale Wand: Restabstand 25 cm auf 1 cm genau (Lage cm-genau gespeichert)', Math.abs(rest - 0.25) <= 0.005 + 1e-9, rest);

// ---------- Projektformat 6 und Migration
check('Aktuelle Formatversion 6', PROJECT_FORMAT_VERSION === 6);
const walls = createRectangleRoom({ width: 5, length: 4, height: 2.5 }).walls;
const plan5 = {
  room: { shape: 'rectangle', height: 2.5, walls },
  openings: [
    { id: 'opening-1', type: 'door', wall: 'south', offset: 3.1, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' },
    { id: 'opening-2', type: 'window', wall: 'west', offset: 2.3, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 2 },
  ],
  furniture: [{ id: 'furniture-1', type: 'sofa', name: 'Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2.5, z: 3.4 }, rotationDeg: 180 }],
  fixtures: [],
  groups: [],
  design: { floor: 'oak', wallColors: Object.fromEntries(walls.map((w) => [w.id, '#fbfbfa'])), wallFinishes: {}, ceilingColor: '#ffffff', lighting: { preset: 'neutral', brightness: 1 } },
};
const meta = (version: number) => ({ format: 'raumplaner-project', version, id: `v${version}`, name: `V${version}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const v5 = parseProject(JSON.stringify({ ...meta(5), plan: plan5 }));
const v6 = parseProject(JSON.stringify({ ...meta(6), plan: plan5 }));
check('Version 5 lesbar, ohne Warnungen, auf 6 gehoben', v5.ok && v5.project.version === 6 && v5.warnings.length === 0, v5);
check('Version 5 → 6: Plan identisch (Türen, Fenster, Geometrie, Möbel)', v5.ok && v6.ok && JSON.stringify(v5.project.plan) === JSON.stringify(v6.project.plan));
const withPassage = { ...plan5, openings: [...plan5.openings, { id: 'opening-3', type: 'passage', wall: 'east', offset: 1.5, width: 1.1, height: 2.05 }] };
const parsed = parseProject(JSON.stringify({ ...meta(6), plan: withPassage }));
check('Version 6: Durchgang wird gelesen (Wand, Position, Breite, Höhe)', parsed.ok && JSON.stringify(parsed.project.plan.openings[2]) === JSON.stringify({ id: 'opening-3', wall: 'east', offset: 1.5, width: 1.1, height: 2.05, type: 'passage' }), parsed.ok ? parsed.project.plan.openings[2] : parsed);
if (parsed.ok) {
  const again = parseProject(serializeProject(parsed.project));
  check('Speichern → Laden: Durchgang unverändert (Roundtrip)', again.ok && JSON.stringify(again.project.plan) === JSON.stringify(parsed.project.plan));
}
const broken = parseProject(JSON.stringify({ ...meta(6), plan: { ...plan5, openings: [{ id: 'opening-9', type: 'passage', wall: 'nirgends', offset: 0, width: 1, height: 2 }] } }));
check('Durchgang an unbekannter Wand: übersprungen mit Warnung', broken.ok && broken.project.plan.openings.length === 0 && broken.warnings.length === 1);
const legacyPassage = parseProject(JSON.stringify({ ...meta(5), plan: withPassage }));
check('Version 5 mit fremdem Öffnungstyp bleibt robust lesbar', legacyPassage.ok);
const future = parseProject(JSON.stringify({ ...meta(7), plan: plan5 }));
check('Version 7: verständliche Ablehnung (neuere Version)', !future.ok && future.error.includes('neueren Version'));

done();
