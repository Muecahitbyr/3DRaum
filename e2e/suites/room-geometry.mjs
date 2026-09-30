import { chromium } from 'playwright-core';

/**
 * Unit-Tests der Raumgeometrie (Polygon, Vorlagen, Validierung, Bearbeitung,
 * Möbel-Containment, Abstände, Migration, Boden-/Wandgeometrie). Die Module werden
 * direkt über den Vite-Dev-Server geladen – ohne Nachbau im Test.
 */
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);

const r = await page.evaluate(async () => {
  const plan = await import('/src/utils/room/plan.ts');
  const model = await import('/src/utils/room/model.ts');
  const polygon = await import('/src/utils/polygon.ts');
  const containment = await import('/src/utils/room/containment.ts');
  const clearance = await import('/src/utils/furnitureClearance.ts');
  const furniture = await import('/src/utils/furniture.ts');
  const formation = await import('/src/utils/furnitureFormation.ts');
  const format = await import('/src/projects/format.ts');
  const floor = await import('/src/components/scene/room/Floor.tsx');
  const wallGeometry = await import('/src/utils/wallGeometry.ts');
  const remap = await import('/src/utils/room/remap.ts');
  const out = {};
  const len = (w) => Math.round(Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z) * 100) / 100;

  // Vorlagen
  const rect = plan.createRectangleRoom({ width: 5, length: 4, height: 2.5 });
  out.rect = { ids: rect.walls.map((w) => w.id), lengths: rect.walls.map(len), valid: plan.validateRoomPlan(rect), origin: rect.origin, area: polygon.signedArea(rect.walls.map((w) => w.start)) };
  const rm = model.roomModelOf(rect);
  out.rectModel = { isRectangle: rm.isRectangle, labels: rm.walls.map((w) => w.label), miter: rm.walls.map((w) => [w.outerStart, w.outerEnd]), reading: rm.walls.map((w) => w.readingReversed), outer: rm.outerBounds };
  const l = plan.createLShapeRoom(2.5);
  out.l = { count: l.walls.length, lengths: l.walls.map(len), valid: plan.validateRoomPlan(l), area: polygon.signedArea(l.walls.map((w) => w.start)) };
  const lm = model.roomModelOf(l);
  out.lMiter = lm.walls.map((w) => [Math.round(w.outerStart * 1000) / 1000, Math.round((w.outerEnd - w.length) * 1000) / 1000]);
  const free = plan.createFreeRoom(2.5);
  out.free = { count: free.walls.length, lengths: free.walls.map(len), valid: plan.validateRoomPlan(free), diagonal: model.roomModelOf(free).walls.filter((w) => w.facing === null).length };

  // Validierung
  const bow = { ...rect, walls: plan.wallsFromCorners([{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }], ['a', 'b', 'c', 'd'], 2.5) };
  out.bow = plan.validateRoomPlan(bow);
  const zero = { ...rect, walls: plan.wallsFromCorners([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }], ['a', 'b', 'c', 'd'], 2.5) };
  out.zero = plan.validateRoomPlan(zero);
  out.nan = plan.validateRoomPlan({ ...rect, walls: rect.walls.map((w, i) => (i === 1 ? { ...w, end: { x: NaN, z: 4 } } : w)) });
  out.open = plan.validateRoomPlan({ ...rect, walls: rect.walls.map((w, i) => (i === 1 ? { ...w, end: { x: 5, z: 3 } } : w)) });
  out.spike = plan.validateRoomPlan({ ...rect, walls: plan.wallsFromCorners([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 0.5 }], ['a', 'b', 'c'], 2.5) });

  // Bearbeitung
  const moved = plan.moveCorner(free, 'wall-3', { x: 5, z: 3 });
  out.moveOk = moved.ok && len(moved.plan.walls[1]) === 3 && moved.plan.walls[2].start.z === 3;
  const crossing = plan.moveCorner(free, 'wall-3', { x: -1, z: 5 });
  out.moveCross = crossing.ok ? 'ok?' : crossing.error;
  const longer = plan.setWallLength(rect, 'north', 6);
  out.longer = longer.ok && model.roomModelOf(longer.plan).isRectangle && longer.plan.walls.map(len).join(',');
  const split = plan.splitWall(rect, 'north');
  out.split = split.ok && split.plan.walls.length === 5 && split.newWallId;
  const removedCorner = plan.removeCorner(free, 'wall-4');
  out.removeCorner = removedCorner.ok && removedCorner.plan.walls.length === 4 && plan.validateRoomPlan(removedCorner.plan) === null;
  const removeParallel = plan.removeWall(l, 'wall-3');
  out.removeParallel = removeParallel.ok ? 'ok?' : removeParallel.error;
  const removeDiagonal = plan.removeWall(free, 'wall-3');
  out.removeDiagonal = removeDiagonal.ok && removeDiagonal.plan.walls.length === 4 && removeDiagonal.plan.walls.some((w) => w.end.x === 5 && w.end.z === 4);
  out.minWalls = plan.removeCorner({ ...rect, walls: plan.wallsFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 3 }], ['a', 'b', 'c'], 2.5) }, 'a');

  // Normalisierung: Grundriss beginnt bei 0/0, Weltlage bleibt
  const up = plan.moveCorner(rect, 'north', { x: -1, z: -1 });
  const n = plan.normalizeRoomPlan(up.plan);
  const worldBefore = { x: up.plan.walls[0].start.x - up.plan.origin.x, z: up.plan.walls[0].start.z - up.plan.origin.z };
  const worldAfter = { x: n.plan.walls[0].start.x - n.plan.origin.x, z: n.plan.walls[0].start.z - n.plan.origin.z };
  out.normalize = { shift: n.shift, min: polygon.boundsOf(n.plan.walls.map((w) => w.start)), same: worldBefore.x === worldAfter.x && worldBefore.z === worldAfter.z };

  // Möbel-Containment in der L-Form (Aussparung: x 3,5–6, z 3–5)
  const table = { width: 1.4, depth: 0.8, rotationDeg: 0 };
  out.inNotch = containment.fitsInRoom(lm, table, { x: 4.75, z: 4 });
  out.inArm = containment.fitsInRoom(lm, table, { x: 1.5, z: 4 });
  const projected = containment.nearestPositionInRoom(lm, table, { x: 4.75, z: 4 });
  out.projected = { p: projected, fits: containment.fitsInRoom(lm, table, projected) };
  const rotated = containment.nearestPositionInRoom(lm, { width: 2, depth: 0.9, rotationDeg: 45 }, { x: 3.4, z: 3.1 });
  out.rotatedFits = containment.fitsInRoom(lm, { width: 2, depth: 0.9, rotationDeg: 45 }, rotated);
  // Rechteck: identisch zum bisherigen achsweisen Begrenzen
  out.rectClamp = containment.nearestPositionInRoom(rm, { width: 0.45, depth: 0.52, rotationDeg: 0 }, { x: -3, z: 9 });
  // Formation: blockiert an der Aussparung
  const items = [{ id: 'a', width: 1, depth: 1, rotationDeg: 0, position: { x: 2, z: 4 } }, { id: 'b', width: 1, depth: 1, rotationDeg: 0, position: { x: 0.6, z: 4 } }];
  out.formation = formation.clampFormationDelta(items, { x: 3, z: 0 }, lm);
  const item = { id: 'x', type: 'table', name: 'T', width: 1.4, depth: 0.8, height: 0.75, rotationDeg: 0, position: { x: 5, z: 4.5 } };
  out.normalizeFurniture = furniture.normalizeFurniture(item, lm).position;
  out.alignRight = formation.moveFormation([{ ...item, position: { x: 1, z: 4 } }], formation.alignmentDelta([{ ...item, position: { x: 1, z: 4 } }], 'right', lm), lm);

  // Abstände: schräge Wand (freie Form: Diagonale von (5; 2,5) nach (3,5; 4))
  const fm = model.roomModelOf(free);
  const box = { id: 'b', type: 'dresser', name: 'Kommode', width: 1, depth: 0.4, height: 0.8, rotationDeg: 0, position: { x: 3, z: 3.5 } };
  const c = clearance.computeClearances(box, [box], fm);
  out.diagonalRight = c.find((x) => x.direction === 'right');
  out.notchRight = clearance.computeClearances({ ...box, position: { x: 1.5, z: 4.3 } }, [], lm).find((x) => x.direction === 'right').distance;
  const radiator = { id: 'fixture-1', type: 'radiator', wall: 'north', offset: 2, width: 1, height: 0.6, depth: 0.1, elevation: 0.1 };
  const up2 = clearance.computeClearances({ ...box, position: { x: 2.5, z: 1 } }, [], rm, [radiator]).find((x) => x.direction === 'up');
  out.radiatorClearance = { distance: up2.distance, target: up2.target.kind };

  // Neuzuordnung wandgebundener Elemente
  const door = { id: 'd', wall: 'wall-3', offset: 0.5, width: 0.9 };
  out.remapRemoved = remap.remapWallItem(door, fm, model.roomModelOf(removeDiagonal.plan), new Set(['wall-3']));
  const southDoor = { id: 'd2', wall: 'south', offset: 1, width: 0.9 };
  const wider = plan.resizeRectangle(rect, { width: 6, length: 4, height: 2.5 });
  out.remapResize = remap.remapWallItem(southDoor, rm, model.roomModelOf(wider.plan));

  // Migration v3 → v4
  const v3 = {
    format: 'raumplaner-project', version: 3, id: 'm', name: 'M', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    plan: {
      dimensions: { width: 5, length: 4, height: 2.5 },
      openings: [{ id: 'opening-1', type: 'door', wall: 'south', offset: 1, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' }, { id: 'opening-2', type: 'window', wall: 'west', offset: 0.5, width: 1.2, height: 1.2, sillHeight: 0.9, sashes: 2 }],
      furniture: [{ id: 'furniture-1', type: 'sofa', name: 'S', width: 2, depth: 0.9, height: 0.85, position: { x: 2, z: 2 }, rotationDeg: 0 }],
      fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'east', offset: 1, width: 1, height: 0.6, depth: 0.1, elevation: 0.1 }],
      groups: [], design: { floor: 'tiles', wallColors: { north: '#111111', east: '#222222', south: '#333333', west: '#444444' } },
    },
  };
  const parsed = format.parseProject(JSON.stringify(v3));
  out.migration = parsed.ok ? { walls: parsed.project.plan.room.walls.map((w) => w.id), openings: parsed.project.plan.openings.map((o) => [o.wall, o.offset]), fixtures: parsed.project.plan.fixtures.map((f) => [f.wall, f.offset]), furniture: parsed.project.plan.furniture[0].position, colors: parsed.project.plan.design.wallColors, origin: parsed.project.plan.room.origin, warnings: parsed.warnings } : parsed;
  const v4bad = { ...v3, version: 4, plan: { ...v3.plan, dimensions: undefined, room: { shape: 'free', height: 2.5, walls: bow.walls } } };
  const badParsed = format.parseProject(JSON.stringify(v4bad));
  out.badRoom = badParsed.ok ? 'ok?' : badParsed.error;
  const v4nan = { ...v4bad, plan: { ...v4bad.plan, room: { shape: 'free', height: 2.5, walls: [{ id: 'a', start: { x: 'x' }, end: {} }] } } };
  out.nanRoom = format.parseProject(JSON.stringify(v4nan)).error;

  // Boden (Ear Clipping): Fläche = Umriss, keine Fläche in der Aussparung
  const g = floor.buildFloorGeometry(lm);
  const pos = g.getAttribute('position');
  let area = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), az = pos.getZ(i), bx = pos.getX(i + 1), bz = pos.getZ(i + 1), cx = pos.getX(i + 2), cz = pos.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
  }
  const normalsUp = [...g.getAttribute('normal').array].every((v, i) => (i % 3 === 1 ? v === 1 : v === 0));
  out.floor = { area: Math.round(area * 1000) / 1000, triangles: pos.count / 3, normalsUp };

  // Wandgeometrie mit Gehrung: endliche Werte, Außenlänge wie berechnet
  const wall = lm.walls[0];
  const wg = wallGeometry.buildWallGeometry(wall.length, 2.5, wall.thickness, [{ x0: -0.5, x1: 0.5, y0: 0.9, y1: 2.1 }], { outerStart: wall.outerStart, outerEnd: wall.outerEnd });
  wg.computeBoundingBox();
  out.wallGeometry = { finite: [...wg.getAttribute('position').array].every(Number.isFinite), size: wg.boundingBox.max.x - wg.boundingBox.min.x, expected: wall.outerEnd - wall.outerStart };
  return out;
});

const lengths = (a) => a.join(',');
check('Rechteck: vier Wände north/east/south/west, 5/4/5/4 m, gültig', lengths(r.rect.ids) === 'north,east,south,west' && lengths(r.rect.lengths) === '5,4,5,4' && r.rect.valid === null, JSON.stringify(r.rect));
check('Rechteck: Ursprung in der Mitte (Welt wie bisher zentriert), Umlaufrichtung positiv', r.rect.origin.x === 2.5 && r.rect.origin.z === 2 && r.rect.area === 20);
check('Rechteck: erkannt, Bezeichnungen „Nord (oben)“ …', r.rectModel.isRectangle && r.rectModel.labels[0] === 'Nord (oben)' && r.rectModel.labels[2] === 'Süd (unten)');
check('Rechteck: Gehrung an jeder Ecke (Außenfläche je Seite 15 cm länger)', r.rectModel.miter.every(([s, e], i) => Math.abs(s + 0.15) < 1e-9 && Math.abs(e - [5, 4, 5, 4][i] - 0.15) < 1e-9));
check('Rechteck: Leserichtung Süd/West umgekehrt (Positionen „von links/oben“)', JSON.stringify(r.rectModel.reading) === '[false,false,true,true]');
check('Rechteck: Außenhülle ±2,65 × ±2,15', Math.abs(r.rectModel.outer.minX + 2.65) < 1e-9 && Math.abs(r.rectModel.outer.maxZ - 2.15) < 1e-9);
check('L-Form: sechs Wände 6 / 3 / 2,5 / 2 / 3,5 / 5 m, Fläche 25 m²', r.l.count === 6 && lengths(r.l.lengths) === '6,3,2.5,2,3.5,5' && r.l.valid === null && r.l.area === 25, JSON.stringify(r.l));
check('L-Form: Innenecke mit verkürzter Außenfläche (Gehrung nach innen)', r.lMiter[2][1] === -0.15 && r.lMiter[3][0] === 0.15, JSON.stringify(r.lMiter));
check('Freie Form: fünf Wände, eine schräg (2,12 m), gültig', r.free.count === 5 && r.free.diagonal === 1 && r.free.lengths.includes(2.12) && r.free.valid === null, JSON.stringify(r.free));
check('Ungültig: Selbstüberschneidung', r.bow === 'Wände dürfen sich nicht überschneiden.', r.bow);
check('Ungültig: Wand mit Länge 0', /mindestens 20 cm/.test(r.zero ?? ''), r.zero);
check('Ungültig: NaN', r.nan === 'Der Grundriss enthält ungültige Zahlen.', r.nan);
check('Ungültig: offener Umriss', r.open === 'Der Grundriss ist nicht geschlossen.', r.open);
check('Ungültig: zu spitze Ecke', r.spike === 'Die Ecke ist zu spitz.', r.spike);
check('Ecke verschieben: angrenzende Wände folgen', r.moveOk === true);
check('Ecke verschieben mit Überschneidung: abgelehnt mit Begründung', r.moveCross === 'Wände dürfen sich nicht überschneiden.', r.moveCross);
check('Wandlänge ändern: Rechteck bleibt Rechteck (6/4/6/4)', r.longer === '6,4,6,4', String(r.longer));
check('Wand teilen: fünf Wände, neue ID', r.split === 'wall-5', String(r.split));
check('Ecke entfernen: gültiges Viereck', r.removeCorner === true);
check('Wand entfernen mit parallelen Nachbarn: verständlich abgelehnt', /parallel/.test(r.removeParallel), r.removeParallel);
check('Wand entfernen: Nachbarn bis zum Schnittpunkt verlängert (Ecke 5/4)', r.removeDiagonal === true);
check('Mindestens drei Wände', r.minWalls.ok === false && /drei Wände/.test(r.minWalls.error));
check('Normalisierung: Umriss beginnt bei 0/0, Weltlage unverändert', r.normalize.min.minX === 0 && r.normalize.min.minZ === 0 && r.normalize.shift.x === 1 && r.normalize.same, JSON.stringify(r.normalize));
check('L-Form: Tisch in der Aussparung unzulässig, im Schenkel zulässig', r.inNotch === false && r.inArm === true);
check('L-Form: nächste zulässige Position außerhalb der Aussparung', r.projected.fits && (r.projected.p.x <= 3.5 - 0.7 + 1e-9 || r.projected.p.z <= 3 - 0.4 + 1e-9), JSON.stringify(r.projected));
check('L-Form: gedrehtes Sofa an der Innenecke passt nach dem Einschieben', r.rotatedFits === true);
check('Rechteck: Begrenzen wie bisher (0,23 / 3,74)', r.rectClamp.x === 0.23 && r.rectClamp.z === 3.74, JSON.stringify(r.rectClamp));
check('Formation: Verschieben stoppt an der Aussparung', r.formation.x === 1 && r.formation.z === 0, JSON.stringify(r.formation));
check('Möbel in der Aussparung wird herausgeschoben', r.normalizeFurniture.x <= 2.8 || r.normalizeFurniture.z <= 2.6, JSON.stringify(r.normalizeFurniture));
check('Rechts ausrichten in der L-Form: bis zur Innenwand der Aussparung (x = 2,80)', r.alignRight.x.x === 2.8, JSON.stringify(r.alignRight));
check('Abstand zur schrägen Wand (Kommode 3,00/3,50 → Diagonale)', r.diagonalRight.target.kind === 'wall' && Math.abs(r.diagonalRight.distance - 0.3) < 0.011, JSON.stringify(r.diagonalRight));
check('Abstand in der L-Form: zur Innenwand der Aussparung (x 3,5), nicht zur Hülle', Math.abs(r.notchRight - 1.5) < 1e-6, String(r.notchRight));
check('Heizkörper als Hindernis in der Abstandsmessung (0,80 − 0,10 = 0,70)', r.radiatorClearance.target === 'fixture' && Math.abs(r.radiatorClearance.distance - 0.7) < 1e-6, JSON.stringify(r.radiatorClearance));
check('Neuzuordnung: Element einer entfernten Wand geht an die nächste Wand', r.remapRemoved && r.remapRemoved.wall !== 'wall-3', JSON.stringify(r.remapRemoved));
check('Neuzuordnung: Südwand-Tür behält Abstand von links bei breiterem Raum', r.remapResize.offset === 1 + 1, JSON.stringify(r.remapResize));
check('Migration v3 → v4: Wände, Farben, Möbel unverändert', r.migration.walls?.join(',') === 'north,east,south,west' && r.migration.colors.south === '#333333' && r.migration.furniture.x === 2 && r.migration.furniture.z === 2 && r.migration.warnings.length === 0, JSON.stringify(r.migration));
check('Migration: Positionen Süd/West ab Wandanfang umgerechnet, Nord/Ost unverändert', JSON.stringify(r.migration.openings) === '[["south",3.1],["west",2.3]]' && JSON.stringify(r.migration.fixtures) === '[["east",1]]', JSON.stringify(r.migration.openings));
check('Migration: Raum wieder im Ursprung zentriert', r.migration.origin?.x === 2.5 && r.migration.origin?.z === 2);
check('Beschädigter Grundriss (Selbstüberschneidung) wird abgelehnt', /Grundriss ist ungültig: Wände dürfen sich nicht überschneiden/.test(r.badRoom), r.badRoom);
check('Grundriss ohne gültige Zahlen wird abgelehnt', r.nanRoom === 'Die Raummaße sind ungültig.', r.nanRoom);
check('Boden der L-Form: Fläche 25 m² (keine Fläche in der Aussparung), Normalen nach oben', r.floor.area === 25 && r.floor.normalsUp, JSON.stringify(r.floor));
check('Wandgeometrie mit Gehrung und Öffnung: endlich, Außenlänge korrekt', r.wallGeometry.finite && Math.abs(r.wallGeometry.size - r.wallGeometry.expected) < 1e-6, JSON.stringify(r.wallGeometry));
check('Keine Laufzeitfehler', errors.length === 0, errors.join(' | '));

const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
