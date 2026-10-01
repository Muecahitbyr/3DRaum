import { polygonArea, polygonPerimeter } from '../../src/utils/polygon.ts';
import { roomModelOf } from '../../src/utils/room/model.ts';
import {
  layoutChainLabels,
  offsetForReadingDistance,
  openingChain,
  readingDistances,
  readingSides,
  roomMeasurements,
  toReadingChain,
} from '../../src/utils/room/measurements.ts';
import { createFreeRoom, createLShapeRoom, createRectangleRoom, wallsFromCorners } from '../../src/utils/room/plan.ts';
import { createWallDimensions } from '../../src/utils/room/dimensions.ts';
import { dimensionPoint, layoutRoomDimensions, type DimensionLayoutOptions } from '../../src/utils/room/dimensionLayout.ts';
import type { RoomPlan, WallDimension } from '../../src/types/room.ts';
import type { RoomModel } from '../../src/utils/room/model.ts';
import { createSuite } from './harness.ts';

/** Raumfläche, Umfang, Lagemaße von Öffnungen entlang (auch schräger) Wände, Maßkette und Etikett-Layout. */
const { check, near, done } = createSuite();

// ---------- Polygonfläche und Umfang
const square = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];
check('Fläche Quadrat 2 × 2 = 4 m²', polygonArea(square) === 4);
check('Fläche unabhängig von der Umlaufrichtung', polygonArea([...square].reverse()) === 4);
check('Umfang Quadrat 2 × 2 = 8 m', polygonPerimeter(square) === 8);
const triangle = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 4 }];
check('Dreieck 3-4-5: Fläche 6 m², Umfang 12 m (Schlusskante schräg)', polygonArea(triangle) === 6 && near(polygonPerimeter(triangle), 12));
check('Entartet (eine Kante): Fläche 0', polygonArea([{ x: 0, z: 0 }, { x: 1, z: 0 }]) === 0);

// ---------- Raummaße aus der tatsächlichen Kontur
const rect = roomModelOf(createRectangleRoom({ width: 5, length: 4, height: 2.5 }));
let m = roomMeasurements(rect);
check('Rechteck 5 × 4: 20 m², Umfang 18 m', near(m.area, 20) && near(m.perimeter, 18), m);

const lRoom = roomModelOf(createLShapeRoom(2.5));
m = roomMeasurements(lRoom);
check('L-Form 6 × 5 mit Ausschnitt 2,5 × 2: 25 m² (nicht Hülle 30 m²), Umfang 22 m', near(m.area, 25) && near(m.perimeter, 22), m);

const free = roomModelOf(createFreeRoom(2.5));
m = roomMeasurements(free);
// 5 × 4 minus Dreieck 1,5 × 1,5 / 2 = 20 − 1,125; Umfang 5 + 2,5 + √4,5 + 3,5 + 4
check('Freie Form mit diagonaler Wand: 18,875 m²', near(m.area, 18.875), m);
check('Freie Form: Umfang mit schräger Wand (15 + √4,5)', near(m.perimeter, 15 + Math.sqrt(4.5)), m);

const diamondPlan: RoomPlan = {
  shape: 'free',
  walls: wallsFromCorners([{ x: 2, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 2 }], ['wall-1', 'wall-2', 'wall-3', 'wall-4'], 2.5),
  height: 2.5,
  origin: { x: 2, z: 2 },
};
const diamond = roomModelOf(diamondPlan);
m = roomMeasurements(diamond);
check('Raute (nur diagonale Wände): 8 m² statt Hülle 16 m², Umfang 4 × √8', near(m.area, 8) && near(m.perimeter, 4 * Math.sqrt(8)), m);
check('Umfang = Summe der lichten Wandlängen', near(m.perimeter, diamond.walls.reduce((s, w) => s + w.length, 0)));

// ---------- Lagemaße in Grundriss-Leserichtung
const north = rect.wallById.get('north')!; // läuft links → rechts
const south = rect.wallById.get('south')!; // läuft rechts → links (Leserichtung umgekehrt)
const west = rect.wallById.get('west')!; // läuft unten → oben
check('Seitennamen: waagerecht links/rechts, senkrecht oben/unten', readingSides(north).start === 'links' && readingSides(north).end === 'rechts' && readingSides(west).start === 'oben' && readingSides(west).end === 'unten');
let d = readingDistances(north, { offset: 0.8, width: 0.9 });
check('Nordwand: Abstand links 0,80, rechts 3,30 (5 − 0,8 − 0,9)', near(d.start, 0.8) && near(d.end, 3.3), d);
d = readingDistances(south, { offset: 0.8, width: 0.9 });
check('Südwand (gegenläufig): ab Wandanfang 0,80 = von rechts 0,80, von links 3,30', near(d.start, 3.3) && near(d.end, 0.8), d);
d = readingDistances(west, { offset: 0.5, width: 1.2 });
check('Westwand (gegenläufig): von oben 2,30, von unten 0,50', near(d.start, 2.3) && near(d.end, 0.5), d);
check('Abstand + Breite + Rest = Wandlänge', near(d.start + 1.2 + d.end, west.length));

for (const wall of [north, south, west]) {
  const startOffset = offsetForReadingDistance(wall, 0.9, 'start', 0.8);
  const endOffset = offsetForReadingDistance(wall, 0.9, 'end', 0.8);
  check(`${wall.label}: Eingabe „Abstand ${readingSides(wall).start} 0,80“ ergibt genau diesen Abstand`, near(readingDistances(wall, { offset: startOffset, width: 0.9 }).start, 0.8));
  check(`${wall.label}: Eingabe „Abstand ${readingSides(wall).end} 0,80“ ergibt genau diesen Abstand`, near(readingDistances(wall, { offset: endOffset, width: 0.9 }).end, 0.8));
}

// Diagonale Wand der freien Form: (5; 2,5) → (3,5; 4), Länge √4,5 ≈ 2,121
const diagonal = free.walls.find((w) => w.facing === null)!;
check('Diagonale Wand gefunden, Länge √4,5', !!diagonal && near(diagonal.length, Math.sqrt(4.5)), diagonal?.length);
d = readingDistances(diagonal, { offset: 0.4, width: 1.2 });
check('Diagonale Wand: Abstände entlang der Wand (nicht in x/z projiziert)', near(d.start + 1.2 + d.end, Math.sqrt(4.5)) && (near(d.start, 0.4) || near(d.end, 0.4)), d);
const diagonalOffset = offsetForReadingDistance(diagonal, 1.2, 'end', 0.25);
check('Diagonale Wand: Eingabe Restabstand 0,25 ergibt Lage entlang der Wand', near(readingDistances(diagonal, { offset: diagonalOffset, width: 1.2 }).end, 0.25), diagonalOffset);

// ---------- Maßkette
check('Ohne Öffnungen: keine Kette', openingChain(5, []).length === 0);
let chain = openingChain(5, [{ offset: 0.8, width: 0.9 }]);
check('Eine Öffnung: Wandanfang → Öffnung → Wandende', JSON.stringify(chain.map((s) => [+s.from.toFixed(4), +s.to.toFixed(4), s.opening])) === '[[0,0.8,false],[0.8,1.7,true],[1.7,5,false]]', chain);
check('Kette lückenlos, Summe = Wandlänge', near(chain.reduce((s, c) => s + c.length, 0), 5));
chain = openingChain(5, [{ offset: 3, width: 1.2 }, { offset: 0, width: 0.9 }]);
check('Öffnung an der Ecke: kein Null-Abschnitt; Reihenfolge entlang der Wand', JSON.stringify(chain.map((s) => [s.from, s.to, s.opening])) === '[[0,0.9,true],[0.9,3,false],[3,4.2,true],[4.2,5,false]]', chain);
chain = openingChain(5, [{ offset: 1, width: 1.5 }, { offset: 2, width: 1 }]);
check('Überlappende Öffnungen (Kollision): trotzdem lückenlose Kette', near(chain.reduce((s, c) => s + c.length, 0), 5) && chain.every((s) => s.length > 0), chain);
chain = openingChain(diagonal.length, [{ offset: 0.4, width: 1.2 }]);
check('Diagonale Wand: letzter Abschnitt bis exakt zur Wandlänge', chain.at(-1)!.to === diagonal.length && near(chain.at(-1)!.length, diagonal.length - 1.6));
const southChain = toReadingChain(south, openingChain(5, [{ offset: 0.8, width: 0.9 }]));
check('Leserichtung Südwand: von links 3,30 · 0,90 · 0,80', JSON.stringify(southChain.map((s) => +s.length.toFixed(2))) === '[3.3,0.9,0.8]' && southChain[0].from === 0 && near(southChain.at(-1)!.to, 5), southChain);

// ---------- Etikett-Layout (ruhige Kette ohne Überlappungen)
let slots = layoutChainLabels([{ from: 0, to: 100 }, { from: 100, to: 190 }, { from: 190, to: 400 }], [30, 30, 30], 4);
check('Genug Platz: alle Etiketten in der Kette', slots.every((s) => s.placement === 'inline'));
slots = layoutChainLabels([{ from: 0, to: 10 }, { from: 10, to: 100 }, { from: 100, to: 300 }], [30, 30, 30], 4);
check('Kurzer Abschnitt: Etikett auf die zweite Spur', slots[0].placement === 'outside' && slots[1].placement === 'inline' && slots[2].placement === 'inline', slots);
slots = layoutChainLabels([{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 20, to: 30 }, { from: 30, to: 300 }], [30, 30, 30, 30], 4);
const outside = slots.filter((s) => s.placement === 'outside');
const overlap = outside.some((a, i) => outside.some((b, j) => i < j && Math.abs(a.center - b.center) < 30 + 4 - 1e-9));
check('Mehrere kurze Abschnitte: zweite Spur ohne Überlappung', !overlap && slots[3].placement === 'inline', slots);
check('Zu dicht: überzählige Etiketten entfallen statt sich zu überdecken', slots.some((s) => s.placement === 'hidden') || outside.length === 3, slots);

// ---------- Wandübergreifende Platzierung (Live-Grundriss und Export)
const fmt = (v: number) => v.toFixed(2).replace('.', ',');
const metrics = (pxPerMeter: number): DimensionLayoutOptions => ({
  pxPerMeter,
  offsets: { overall: 30, overallWithChain: 62, chain: 22, lane: 40 },
  gap: 3,
  overallText: (l) => `${fmt(l)} m`,
  chainText: fmt,
  overallSize: (t) => ({ w: t.length * 7.2 + 16, h: 20 }),
  chainSize: (t) => ({ w: t.length * 6.6 + 8, h: 15 }),
});
function layoutOf(model: RoomModel, spans: { wall: string; offset: number; width: number }[], pxPerMeter: number) {
  const dims = createWallDimensions(model);
  const chains = model.walls.map((w) => {
    const own = spans.filter((s) => s.wall === w.id);
    return own.length ? toReadingChain(w, openingChain(w.length, own)) : null;
  });
  const opts = metrics(pxPerMeter);
  const layout = layoutRoomDimensions(dims, chains, opts);
  // Alle sichtbaren Etiketten als entlang der Wand gedrehte Rechtecke (unabhängig nachgerechnet, Trennachsen-Test).
  type B = { x: number; y: number; u: [number, number]; hw: number; hh: number; text: string };
  const boxes: B[] = [];
  const add = (d: WallDimension, along: number, offset: number, size: { w: number; h: number }, text: string) => {
    const p = dimensionPoint(d, along, offset);
    boxes.push({ x: p.x * pxPerMeter, y: p.z * pxPerMeter, u: [(d.end.x - d.start.x) / d.length, (d.end.z - d.start.z) / d.length], hw: size.w / 2, hh: size.h / 2, text });
  };
  layout.forEach((l, i) => {
    add(dims[i], l.overall.along, l.overall.offset, opts.overallSize(l.overall.text), l.overall.text);
    for (const c of l.chain) add(dims[i], c.along, c.offset, opts.chainSize(c.text), c.text);
  });
  const radius = (b: B, ax: [number, number]) => b.hw * Math.abs(b.u[0] * ax[0] + b.u[1] * ax[1]) + b.hh * Math.abs(-b.u[1] * ax[0] + b.u[0] * ax[1]);
  const hit = (a: B, b: B) => ([a.u, [-a.u[1], a.u[0]], b.u, [-b.u[1], b.u[0]]] as [number, number][]).every((ax) => Math.abs((b.x - a.x) * ax[0] + (b.y - a.y) * ax[1]) < radius(a, ax) + radius(b, ax));
  const clashes = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => hit(a, b)).map((b) => `${a.text}/${b.text}`));
  const chainCount = chains.reduce((n, c) => n + (c?.length ?? 0), 0);
  const shown = layout.reduce((n, l) => n + l.chain.length, 0);
  return { layout, clashes, chainCount, shown };
}
const lSpans = [
  { wall: 'wall-1', offset: 0.5, width: 1.6 }, { wall: 'wall-1', offset: 3.8, width: 1.2 },
  { wall: 'wall-5', offset: 0.1, width: 0.9 }, { wall: 'wall-3', offset: 0.6, width: 1 }, { wall: 'wall-6', offset: 1.5, width: 1.2 },
];
for (const [label, k] of [['Desktop (≈ 110 px/m)', 110], ['Smartphone (≈ 40 px/m)', 40], ['sehr klein (15 px/m)', 15]] as const) {
  const r = layoutOf(lRoom, lSpans, k);
  check(`L-Form ${label}: keine überdeckten Beschriftungen, auch an der Innenecke`, r.clashes.length === 0, r.clashes);
  check(`L-Form ${label}: jedes Gesamtmaß beschriftet`, r.layout.length === 6 && r.layout.every((l) => l.overall.text.endsWith(' m')));
}
const big = layoutOf(lRoom, lSpans, 110);
check('L-Form Desktop: alle Kettenmaße sichtbar', big.shown === big.chainCount, `${big.shown}/${big.chainCount}`);
const tinyScale = layoutOf(lRoom, lSpans, 15);
check('Sehr kleiner Maßstab: lieber Maße weglassen als überdecken', tinyScale.shown < tinyScale.chainCount && tinyScale.clashes.length === 0);
const passageRoom = roomModelOf(createRectangleRoom({ width: 4.5, length: 3.6, height: 2.6 }));
const phone = layoutOf(passageRoom, [{ wall: 'east', offset: 0.05, width: 1.4 }, { wall: 'south', offset: 0.35, width: 0.9 }, { wall: 'north', offset: 1.5, width: 1.5 }], 48);
check('Durchgang 5 cm neben der Ecke (Smartphone): alle Maße sichtbar, kurze auf zweiter Spur', phone.shown === phone.chainCount && phone.clashes.length === 0 && phone.layout[1].chain[0].placement === 'outside', phone.layout[1].chain);
const diag = layoutOf(free, [{ wall: diagonal.id, offset: 0.4, width: 1.2 }], 60);
check('Diagonale Wand: Kette und Gesamtmaß überdeckungsfrei', diag.clashes.length === 0 && diag.shown >= 2, diag.clashes);

done();
