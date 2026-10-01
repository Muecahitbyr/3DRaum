import { historyReducer, initialHistoryState } from '../../src/state/history.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import { roomMeasurements } from '../../src/utils/room/measurements.ts';
import {
  clampLShape,
  createLShapeRoom,
  createRectangleRoom,
  createRoomForShape,
  lShapeCutLimits,
  lShapeDimensionsOf,
  lShapeFromSize,
  moveCorner,
  resizeLShape,
  setWallLength,
  validateRoomPlan,
} from '../../src/utils/room/plan.ts';
import { createSuite } from './harness.ts';

/** L-Form: Vorlage aus aktuellen Maßen, Hauptmaße erkennen/ändern, Gültigkeit, Reducer und Verlauf. */
const { check, near, done } = createSuite();
const corners = (plan: { walls: { start: { x: number; z: number } }[] }) => JSON.stringify(plan.walls.map((w) => [w.start.x, w.start.z]));
const SIZE = { min: 1, max: 30 };

// ---------- Vorlage und Ableitung aus Raummaßen
const template = createLShapeRoom(2.5);
check('Vorlage (neues Projekt): 6 × 5 m, Ausschnitt 2,5 × 2 m', corners(template) === '[[0,0],[6,0],[6,3],[3.5,3],[3.5,5],[0,5]]');
check('Vorlage gültig', validateRoomPlan(template) === null);
check('40 %-Regel: 6 × 5 → Ausschnitt 2,5 × 2 (bisherige Vorlage)', JSON.stringify(lShapeFromSize(6, 5)) === '{"width":6,"length":5,"cutWidth":2.5,"cutLength":2}');
check('40 %-Regel: 5 × 4 → Ausschnitt 2 × 1,5', JSON.stringify(lShapeFromSize(5, 4)) === '{"width":5,"length":4,"cutWidth":2,"cutLength":1.5}');
const tiny = lShapeFromSize(1, 1);
check('Kleinster Raum 1 × 1: Ausschnitt bleibt im gültigen Bereich (Schenkel ≥ 20 cm)', tiny.cutWidth >= 0.2 && tiny.cutWidth <= 0.8 && validateRoomPlan(createLShapeRoom(2.5, tiny)) === null, tiny);
const huge = createLShapeRoom(2.5, lShapeFromSize(30, 30));
check('Größter Raum 30 × 30: gültige L-Form', validateRoomPlan(huge) === null);

const fromCurrent = createRoomForShape('l-shape', 2.7, { width: 4.2, length: 3.6, height: 2.7 });
check('Formwechsel übernimmt aktuelle Maße (4,20 × 3,60), nicht 6 × 5', JSON.stringify(lShapeDimensionsOf(fromCurrent)) === JSON.stringify({ width: 4.2, length: 3.6, cutWidth: 1.5, cutLength: 1.5 }), lShapeDimensionsOf(fromCurrent));
check('Formwechsel: Raumhöhe übernommen, Form „l-shape“', fromCurrent.height === 2.7 && fromCurrent.shape === 'l-shape' && fromCurrent.walls.every((w) => w.height === 2.7));
check('Neues Projekt ohne Maße: Vorlage 6 × 5', corners(createRoomForShape('l-shape', 2.5)) === corners(template));

// ---------- Erkennen der Hauptmaße
check('Erkennt Vorlage', JSON.stringify(lShapeDimensionsOf(template)) === '{"width":6,"length":5,"cutWidth":2.5,"cutLength":2}');
check('Rechteck ist keine L-Form', lShapeDimensionsOf(createRectangleRoom({ width: 5, length: 4, height: 2.5 })) === null);
const dragged = moveCorner(template, 'wall-4', { x: 3.2, z: 3.4 });
check('Frei bearbeitete Ecke: keine L-Maße mehr (Form „frei“)', dragged.ok && lShapeDimensionsOf(dragged.plan) === null);
const longerNotch = setWallLength(template, 'wall-3', 3);
check('Wandlänge der Innenwand geändert: weiterhin L-Form mit Ausschnitt 3,00', longerNotch.ok && lShapeDimensionsOf(longerNotch.plan)?.cutWidth === 3, longerNotch.ok ? lShapeDimensionsOf(longerNotch.plan) : longerNotch);

// ---------- Hauptmaße ändern
const thick = { ...template, walls: template.walls.map((w, i) => ({ ...w, thickness: i === 2 ? 0.3 : w.thickness })) };
const resized = resizeLShape(thick, { width: 7, length: 6, cutWidth: 3, cutLength: 2.5 });
check('Hauptmaße ändern: gültig', resized.ok, resized);
if (resized.ok) {
  check('Hauptmaße ändern: Ecken exakt', corners(resized.plan) === '[[0,0],[7,0],[7,3.5],[4,3.5],[4,6],[0,6]]', corners(resized.plan));
  check('Hauptmaße ändern: Wand-IDs und Wandstärken bleiben', resized.plan.walls.map((w) => w.id).join() === template.walls.map((w) => w.id).join() && resized.plan.walls[2].thickness === 0.3);
  const before = roomModelOf(thick);
  const after = roomModelOf(resized.plan);
  const center = (r: typeof before) => ({ x: (r.bounds.minX + r.bounds.maxX) / 2 - r.origin.x, z: (r.bounds.minZ + r.bounds.maxZ) / 2 - r.origin.z });
  check('Hauptmaße ändern: Raummitte bleibt in der Welt stehen', near(center(before).x, center(after).x) && near(center(before).z, center(after).z));
  check('Hauptmaße ändern: Fläche 7 × 6 − 3 × 2,5 = 34,5 m²', near(roomMeasurements(after).area, 34.5));
}

// ---------- Grenzen
check('Ausschnittgrenzen: Schenkel mindestens 20 cm', JSON.stringify(lShapeCutLimits(5, 4)) === '{"cutWidth":{"min":0.2,"max":4.8},"cutLength":{"min":0.2,"max":3.8}}');
check('Begrenzen: Ausschnitt größer als Raum → bis Schenkel 20 cm', JSON.stringify(clampLShape({ width: 3, length: 3, cutWidth: 9, cutLength: 0 }, SIZE)) === '{"width":3,"length":3,"cutWidth":2.8,"cutLength":0.2}');
check('Begrenzen: Gesamtmaße 1–30 m, cm-genau', JSON.stringify(clampLShape({ width: 0.2, length: 99, cutWidth: 0.5, cutLength: 1.234 }, SIZE)) === '{"width":1,"length":30,"cutWidth":0.5,"cutLength":1.23}');
check('Ungültige Geometrie wird abgelehnt (Ausschnitt = ganze Breite)', !resizeLShape(template, { width: 5, length: 4, cutWidth: 5, cutLength: 1 }).ok);
check('Kein 6-Wand-Raum: verständliche Ablehnung', !resizeLShape(createRectangleRoom({ width: 5, length: 4, height: 2.5 }), lShapeFromSize(5, 4)).ok);

// ---------- Reducer und Verlauf
let h = historyReducer(initialHistoryState, { type: 'setRoomShape', shape: 'l-shape' });
check('Reducer: Rechteck 5 × 4 → L-Form 5 × 4 mit Ausschnitt 2 × 1,5', JSON.stringify(lShapeDimensionsOf(h.present.room)) === '{"width":5,"length":4,"cutWidth":2,"cutLength":1.5}', lShapeDimensionsOf(h.present.room));
h = historyReducer(h, { type: 'setLShapeDimensions', dimensions: { cutWidth: 2.5 } });
check('Reducer: Ausschnittbreite ändern, Rest bleibt', JSON.stringify(lShapeDimensionsOf(h.present.room)) === '{"width":5,"length":4,"cutWidth":2.5,"cutLength":1.5}');
check('Verlauf: ein Schritt „Raummaße ändern“', h.past.length === 2 && h.past.at(-1)!.label === 'Raummaße ändern');
h = historyReducer(h, { type: 'setLShapeDimensions', dimensions: { width: 2 } });
check('Reducer: schmaler als Ausschnitt → Ausschnitt wird begrenzt (Schenkel 20 cm)', lShapeDimensionsOf(h.present.room)?.cutWidth === 1.8, lShapeDimensionsOf(h.present.room));
const same = historyReducer(h, { type: 'setLShapeDimensions', dimensions: { width: 2 } });
check('Reducer: unveränderte Maße → kein Verlaufsschritt', same === h);
h = historyReducer(h, { type: 'history/undo' });
h = historyReducer(h, { type: 'history/undo' });
check('Undo: zurück zur L-Form 5 × 4', JSON.stringify(lShapeDimensionsOf(h.present.room)) === '{"width":5,"length":4,"cutWidth":2,"cutLength":1.5}');
const rect = historyReducer(initialHistoryState, { type: 'setLShapeDimensions', dimensions: { width: 3 } });
check('Reducer: Rechteck ignoriert L-Maße', rect === initialHistoryState);

done();
