import { chromium } from 'playwright-core';
import { addFurniture as addFromLibrary } from '../lib/planner.mjs';

/**
 * Freie Raumformen: L-Form und freie Form (5 Wände, schräge Wand), Grundriss-Editor
 * (Ecke ziehen, Wandlänge/-stärke, Ecke einfügen/entfernen, Wand entfernen, Einrasten,
 * ungültige Grundrisse), wandgebundene Elemente auf schrägen Wänden, Möbel in der
 * echten Raumkontur, Abstände, 2D/3D, Ausblenden schräger Wände, Gestaltung,
 * Speichern/Laden, Migration und Kamera.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 200) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

const roomPanel = page.getByTestId('room-panel');
const fp = page.getByTestId('furniture-properties');
const op = page.getByTestId('opening-properties');
const fx = page.getByTestId('fixture-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const valueOf = async (panel, label) => num(await panel.getByLabel(label, { exact: true }).inputValue());
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const setShape = async (label) => { await roomPanel.getByTestId('room-shape').getByRole('button', { name: label, exact: true }).click(); await settle(600); };
const labels = () => page.getByTestId('dimension-label').evaluateAll((els) => els.map((e) => e.textContent.trim()).sort());
const notices = (panel) => panel.getByTestId('collision-notice').evaluateAll((els) => els.map((e) => e.textContent.trim()));

/** Raum aus der Szene: Ursprung, Umriss (Grundriss), Wand-IDs. */
const room = () => page.evaluate(() => {
  const g = window.__PLANNER_R3F__().scene.getObjectByName('room');
  const walls = [];
  window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.wallId && walls.push(o.userData.wallId));
  return { origin: g.userData.origin, polygon: g.userData.polygon, shape: g.userData.shape, walls };
});
const toScreen = async (x, z, y = 0.02) => {
  const { origin } = await room();
  return page.evaluate(({ x, z, y }) => {
    const s = window.__PLANNER_R3F__();
    const v = s.camera.position.clone().set(x, y, z).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, { x: x - origin.x, z: z - origin.z, y });
};
async function drag(from, to, { shift = false } = {}) {
  const a = await toScreen(from.x, from.z);
  const b = await toScreen(to.x, to.z);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await settle(120);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await settle(250);
}
/** Ecke (Griff) auf einen Grundrisspunkt ziehen. */
async function dragCorner(wallId, to, { steps = 12 } = {}) {
  const handle = page.locator(`[data-testid="room-corner"][data-wall-id="${wallId}"]`);
  const box = await handle.boundingBox();
  const b = await toScreen(to.x, to.z);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await settle(120);
  await page.mouse.up(); await settle(250);
}
const camera = () => page.evaluate(() => { const c = window.__PLANNER_R3F__().camera; return [...c.position.toArray().map((v) => +v.toFixed(4)), +c.zoom.toFixed(4)]; });
const furniturePos = async () => ({ x: await valueOf(fp, 'X-Position'), z: await valueOf(fp, 'Z-Position') });
/** Footprint (achsparallel, 0°/90°) liegt nicht in der L-Aussparung (x > 3,5 und z > 3). */
const outsideNotch = ({ x, z }, w, d) => x + w / 2 <= 3.5 + 1e-6 || z + d / 2 <= 3 + 1e-6;
const floorInfo = () => page.evaluate(() => {
  const f = window.__PLANNER_R3F__().scene.getObjectByName('floor');
  const pos = f.geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), az = pos.getZ(i), bx = pos.getX(i + 1), bz = pos.getZ(i + 1), cx = pos.getX(i + 2), cz = pos.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
  }
  return { area: Math.round(area * 1000) / 1000, material: f.userData.materialId };
});
/** Trifft ein Strahl von oben an Grundrisspunkt (x, z) den Boden? */
const floorHit = async (x, z) => {
  const { origin } = await room();
  return page.evaluate(({ x, z }) => {
    const s = window.__PLANNER_R3F__();
    const f = s.scene.getObjectByName('floor');
    const rc = new s.raycaster.constructor();
    rc.set(s.camera.position.clone().set(x, 10, z), s.camera.position.clone().set(0, -1, 0));
    return rc.intersectObject(f, false).length > 0;
  }, { x: x - origin.x, z: z - origin.z });
};
const wallBody = (id) => page.evaluate((id) => {
  const body = window.__PLANNER_R3F__().scene.getObjectByName(`wall-${id}-body`);
  if (!body) return null;
  body.geometry.computeBoundingBox();
  const b = body.geometry.boundingBox;
  const strip = window.__PLANNER_R3F__().scene.getObjectByName(`wall-${id}-plan-strip`);
  return { opacity: body.material.opacity, color: strip ? strip.material.color.getHexString() : body.material.color.getHexString(), thickness: +(b.max.z - b.min.z).toFixed(4), vis: body.parent.userData.visibility };
}, id);

await toggle('2D');

// ---------- 1. Rechteck bleibt wie bisher ----------
let rm = await room();
check('Rechteck: 4 Wände (north/east/south/west), Breite/Länge-Felder', JSON.stringify(rm.walls) === '["north","east","south","west"]' && rm.shape === 'rectangle' && (await roomPanel.getByLabel('Breite', { exact: true }).count()) === 1);
check('Rechteck: Maßketten 2 × 5,00 m, 2 × 4,00 m', JSON.stringify(await labels()) === '["4,00 m","4,00 m","5,00 m","5,00 m"]', JSON.stringify(await labels()));
check('Rechteck: Raumform-Auswahl „Rechteck“', (await roomPanel.getByTestId('room-shape').locator('[aria-pressed="true"]').textContent()) === 'Rechteck');

// ---------- 2. L-Form ----------
const cam0 = await camera();
// Formwechsel übernimmt die aktuellen Maße (5 × 4) – keine feste Vorlage mehr.
await setShape('L-Form');
const lFields = async () => Promise.all(['Gesamtbreite', 'Gesamtlänge', 'Ausschnitt Breite', 'Ausschnitt Länge'].map((l) => roomPanel.getByLabel(l, { exact: true }).inputValue()));
check('L-Form aus Rechteck 5 × 4: Gesamtmaße übernommen, Ausschnitt 2,00 × 1,50', JSON.stringify(await labels()) === '["1,50 m","2,00 m","2,50 m","3,00 m","4,00 m","5,00 m"]' && JSON.stringify(await lFields()) === '["5,00","4,00","2,00","1,50"]', JSON.stringify([await labels(), await lFields()]));
check('L-Form: Fläche 17,00 m² (5 × 4 − 2 × 1,5), Umfang 18,00 m', (await roomPanel.getByTestId('room-area').textContent()) === '17,00 m²' && (await roomPanel.getByTestId('room-perimeter').textContent()) === '18,00 m');
await key('ControlOrMeta+z');
check('Undo: wieder Rechteck 5 × 4', (await room()).shape === 'rectangle' && (await roomPanel.getByTestId('room-area').textContent()) === '20,00 m²');
await setIn(roomPanel, 'Breite', '6');
await setIn(roomPanel, 'Länge', '5');
await setShape('L-Form');
rm = await room();
check('L-Form: sechs Wände, Verlauf „Raumform ändern“', rm.walls.length === 6 && rm.shape === 'l-shape' && (await undoTitle()) === 'Raumform ändern rückgängig');
check('L-Form: jede Wand bemaßt (6 / 3 / 2,5 / 2 / 3,5 / 5 m), keine Breite/Länge-Felder', JSON.stringify(await labels()) === '["2,00 m","2,50 m","3,00 m","3,50 m","5,00 m","6,00 m"]' && (await roomPanel.getByLabel('Breite', { exact: true }).count()) === 0, JSON.stringify(await labels()));
check('L-Form: Zusammenfassung „6 Wände · Umriss 6,00 × 5,00 m“', (await roomPanel.getByTestId('room-summary').textContent()) === '6 Wände · Umriss 6,00 × 5,00 m');
let floor = await floorInfo();
check('L-Form: Bodenfläche 25 m² (ohne Aussparung)', floor.area === 25, JSON.stringify(floor));
check('L-Form: kein Boden in der Aussparung, Boden in beiden Schenkeln', !(await floorHit(4.75, 4)) && (await floorHit(1.5, 4)) && (await floorHit(5, 1)));
check('2D: neue Raumform wird eingepasst', JSON.stringify(await camera()) !== JSON.stringify(cam0));
await shot('01-l-2d');

// ---------- 3. Möbel in der L-Form ----------
await addFromLibrary(page, 'table'); await settle(); // Esstisch 1,40 × 0,80
let p = await furniturePos();
check('Neues Möbel liegt im Raum (nicht in der Aussparung)', outsideNotch(p, 1.4, 0.8), JSON.stringify(p));
await setIn(fp, 'X-Position', '4,75');
await setIn(fp, 'Z-Position', '4');
p = await furniturePos();
check('Numerisch in die Aussparung → nächste zulässige Position', outsideNotch(p, 1.4, 0.8) && near(p.x, 4.75), JSON.stringify(p));
await setIn(fp, 'X-Position', '1,5'); await setIn(fp, 'Z-Position', '4');
p = await furniturePos();
check('Im unteren Schenkel zulässig (1,50 / 4,00)', p.x === 1.5 && p.z === 4, JSON.stringify(p));
await drag({ x: 1.5, z: 4 }, { x: 4.8, z: 4.2 });
p = await furniturePos();
check('Ziehen in die Aussparung: Möbel bleibt außerhalb (nächste zulässige Stelle)', outsideNotch(p, 1.4, 0.8), JSON.stringify(p));
await setIn(fp, 'X-Position', '1,5'); await setIn(fp, 'Z-Position', '4');
for (let i = 0; i < 25; i++) await page.keyboard.press('Shift+ArrowRight');
await settle();
p = await furniturePos();
check('Pfeiltasten: stoppt an der Innenwand der Aussparung (x = 2,80)', p.x === 2.8 && p.z === 4, JSON.stringify(p));
await setIn(fp, 'X-Position', '3,2'); await setIn(fp, 'Z-Position', '2,5');
await setIn(fp, 'Rotation', '90');
p = await furniturePos();
check('Drehen an der Innenecke: gedrehte Grundfläche bleibt außerhalb der Aussparung', outsideNotch(p, 0.8, 1.4), JSON.stringify(p));
await setIn(fp, 'Rotation', '0');
// Abstandsmessung zur echten Kontur
await setIn(fp, 'X-Position', '1,5'); await setIn(fp, 'Z-Position', '4');
const right = await page.getByTestId('clearance-right').first();
check('Abstand nach rechts zur Innenwand der Aussparung: 130 cm', num(await right.getAttribute('data-distance-cm')) === 130 && (await right.getAttribute('data-target')) === 'wall', await right.getAttribute('data-distance-cm'));
// Mehrfachauswahl + Gruppe: gemeinsam nicht in die Aussparung
await addFromLibrary(page, 'chair'); await settle();
await setIn(fp, 'X-Position', '0,5'); await setIn(fp, 'Z-Position', '4');
const tableAt = async () => { await page.getByTestId('furniture-list-item').filter({ hasText: 'Esstisch 1' }).click(); await settle(); return furniturePos(); };
const chairAt = async () => { await page.getByTestId('furniture-list-item').filter({ hasText: 'Stuhl 1' }).click(); await settle(); return furniturePos(); };
{
  const a = await toScreen(1.5, 4); const b = await toScreen(0.5, 4);
  await page.getByTestId('furniture-list-item').filter({ hasText: 'Esstisch 1' }).click(); await settle();
  await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift'); await settle();
  check('Mehrfachauswahl (Tisch + Stuhl)', (await page.getByTestId('multi-selection').count()) === 1);
  await page.getByTestId('group-furniture').click(); await settle();
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  const c = await toScreen(5.5, 4.3);
  await page.mouse.move(c.x, c.y, { steps: 10 }); await settle(100); await page.mouse.up(); await settle(250);
}
let t = await tableAt(); let c = await chairAt();
check('Gruppe gemeinsam gezogen: beide außerhalb der Aussparung, Abstand erhalten', outsideNotch(t, 1.4, 0.8) && outsideNotch(c, 0.45, 0.52) && near(t.x - c.x, 1, 0.001) && near(t.z, c.z, 0.001), JSON.stringify([t, c]));
// Kollision in der L-Form weiterhin aktiv
await setIn(fp, 'X-Position', String(t.x - 0.5).replace('.', ','));
check('Kollision zwischen Möbeln wird gemeldet', (await notices(fp)).some((n) => n.includes('Esstisch 1')), JSON.stringify(await notices(fp)));
await key('ControlOrMeta+z');
await shot('02-l-furniture');

// ---------- 4. 3D der L-Form, Ausblenden ----------
await toggle('3D');
floor = await floorInfo();
check('3D: Boden der L-Form (25 m²)', floor.area === 25);
await page.evaluate(() => (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(0, 3, 9); s.invalidate(); })()); await settle(900);
const l3 = await wallBody('wall-5');
const lTop = await wallBody('wall-1');
check('3D: kameranahe Wand (unten) ausgeblendet, gegenüberliegende sichtbar', l3.opacity < 0.2 && lTop.opacity === 1, JSON.stringify([l3.opacity, lTop.opacity]));
await shot('03-l-3d');
await toggle('2D');

// ---------- 5. Freie Form mit schräger Wand ----------
await setShape('Frei');
rm = await room();
check('Freie Form: fünf Wände, schräge Wand 2,12 m', rm.walls.length === 5 && (await labels()).includes('2,12 m'), JSON.stringify(await labels()));
check('Freie Form: Möbel an die neue Kontur angepasst', (await page.getByTestId('furniture-list-item').count()) === 2);
// Tür auf der schrägen Wand
await page.getByTestId('add-door').click(); await settle();
await op.getByLabel('Wand').selectOption('wall-3'); await settle();
check('Tür auf schräger Wand: Wand-Auswahl „Wand 3 (schräg)“', (await op.getByLabel('Wand').inputValue()) === 'wall-3' && (await op.getByLabel('Wand').locator('option:checked').textContent()) === 'Wand 3 (schräg)');
const doorFill = await page.evaluate(() => {
  let out = null;
  window.__PLANNER_R3F__().scene.traverse((o) => {
    if (o.userData?.openingType !== 'door') return;
    const sym = o.getObjectByName('door-plan-symbol');
    const fill = sym.children.find((m) => m.isMesh);
    const v = fill.getWorldPosition(fill.position.clone());
    out = { x: v.x, z: v.z, rot: o.parent.rotation.y };
  });
  return out;
});
{
  const { origin } = await room();
  // Diagonale (5; 2,5) → (3,5; 4): Innenlinie x + z = 7,5; Wandmitte 7,5 cm weiter außen.
  const px = doorFill.x + origin.x; const pz = doorFill.z + origin.z;
  const distance = (px + pz - 7.5) / Math.SQRT2;
  check('Tür sitzt in der schrägen Wand (Wandmitte, 45°)', near(distance, 0.075, 0.002) && near(doorFill.rot, -3 * Math.PI / 4, 1e-6), JSON.stringify({ distance, rot: doorFill.rot }));
}
await setIn(op, 'Breite', '0,8');
check('Tür auf schräger Wand: Breite begrenzt/bearbeitbar', (await valueOf(op, 'Breite')) === 0.8);
// Fenster, Heizkörper, Steckdose, Schalter auf der Diagonale
await page.getByTestId('add-window').click(); await settle();
await op.getByLabel('Wand').selectOption('wall-3'); await settle();
check('Fenster auf schräger Wand', (await op.getByLabel('Wand').inputValue()) === 'wall-3');
check('Tür und Fenster überschneiden sich auf der kurzen Wand → Konflikt gemeldet', (await notices(op)).some((n) => n.includes('anderen Element')), JSON.stringify(await notices(op)));
await op.getByLabel('Wand').selectOption('wall-4'); await settle();
await page.getByTestId('add-radiator').click(); await settle();
await fx.getByLabel('Wand').selectOption('wall-3'); await settle();
await setIn(fx, 'Breite', '0,8');
check('Heizkörper auf schräger Wand', (await fx.getByLabel('Wand').inputValue()) === 'wall-3');
await page.getByTestId('add-socket').click(); await settle();
await fx.getByLabel('Wand').selectOption('wall-3'); await settle();
await page.getByTestId('add-switch').click(); await settle();
await fx.getByLabel('Wand').selectOption('wall-3'); await settle();
check('Steckdose und Lichtschalter auf schräger Wand', (await page.getByTestId('fixture-list-item').filter({ hasText: 'Wand 3' }).count()) === 3);
// Tür von der Diagonale auf die Ostwand ziehen
await page.getByTestId('opening-list-item').filter({ hasText: 'Tür 1' }).click(); await settle();
{
  const door = await page.evaluate(() => { let out = null; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.openingType === 'door') { const f = o.getObjectByName('door-plan-symbol').children.find((m) => m.isMesh); out = f.getWorldPosition(f.position.clone()); } }); return { x: out.x, z: out.z }; });
  const { origin } = await room();
  await drag({ x: door.x + origin.x, z: door.z + origin.z }, { x: 4.97, z: 1.2 });
}
check('Tür von der schrägen Wand auf die Ostwand gezogen', (await op.getByLabel('Wand').inputValue()) === 'wall-2', await op.getByLabel('Wand').inputValue());
await shot('04-free-2d');
await toggle('3D');
await page.evaluate(() => (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(6, 3, 6); s.invalidate(); })()); await settle(900);
const diag = await wallBody('wall-3');
const west = await wallBody('wall-5');
check('3D: schräge Wand zur Kamera wird ausgeblendet, gegenüberliegende bleibt', diag.opacity < 0.2 && west.opacity === 1, JSON.stringify([diag.opacity, west.opacity]));
check('3D: Radiator-, Steckdosen- und Schaltermodelle vorhanden', await page.evaluate(() => ['radiator-model', 'socket-model', 'switch-model'].every((n) => !!window.__PLANNER_R3F__().scene.getObjectByName(n))));
await shot('05-free-3d');
await toggle('2D');

// ---------- 6. Grundriss-Editor ----------
await roomPanel.getByTestId('room-edit-toggle').click(); await settle(400);
check('Editor: ein Griff je Ecke', (await page.getByTestId('room-corner').count()) === 5);
const camBefore = await camera();
await dragCorner('wall-3', { x: 5, z: 3 });
rm = await room();
check('Ecke ziehen: angrenzende Wände folgen (3,00 m / 1,80 m)', (await labels()).includes('3,00 m') && (await labels()).includes('1,80 m'), JSON.stringify(await labels()));
check('Ecke ziehen: rastet senkrecht an x = 5 ein', rm.polygon[2].x === 5, JSON.stringify(rm.polygon));
check('Kamera springt beim Bearbeiten nicht', JSON.stringify(await camera()) === JSON.stringify(camBefore));
check('Verlauf: eine Ziehbewegung = ein Schritt „Ecke verschieben“', (await undoTitle()) === 'Ecke verschieben rückgängig');
await key('ControlOrMeta+z');
check('Undo: Grundriss wie vorher (2,50 m / 2,12 m)', (await labels()).includes('2,50 m') && (await labels()).includes('2,12 m'));
await key('ControlOrMeta+Shift+z');
check('Redo: wieder 3,00 m / 1,80 m', (await labels()).includes('3,00 m'));
await key('ControlOrMeta+z');
// Einrasten an anderer Ecke (x = 3,5)
await dragCorner('wall-3', { x: 3.56, z: 2.5 });
rm = await room();
check('Einrasten: x fluchtet mit Nachbarecke (3,50)', rm.polygon[2].x === 3.5, JSON.stringify(rm.polygon[2]));
await key('ControlOrMeta+z');
// Ungültig: Selbstüberschneidung
await dragCorner('wall-3', { x: -0.8, z: 5 }, { steps: 20 });
rm = await room();
const valid = await page.evaluate(async (polygon) => { const m = await import('/src/utils/polygon.ts'); return !m.polygonSelfIntersects(polygon); }, rm.polygon);
check('Selbstüberschneidung verhindert: Rückmeldung, Grundriss bleibt gültig', (await page.getByTestId('room-feedback').count()) === 1 && (await page.getByTestId('room-feedback').textContent()).includes('überschneiden') && valid, await page.getByTestId('room-feedback').textContent().catch(() => ''));
await key('ControlOrMeta+z');
// Esc bricht ab
{
  const handle = page.locator('[data-testid="room-corner"][data-wall-id="wall-3"]');
  const box = await handle.boundingBox();
  const b = await toScreen(5.5, 3.2);
  const before = JSON.stringify((await room()).polygon);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await settle(100);
  await page.keyboard.press('Escape'); await page.mouse.up(); await settle(250);
  check('Esc: Ecke zurück an alter Stelle', JSON.stringify((await room()).polygon) === before);
}
// Wand auswählen und numerisch ändern
{
  const a = await toScreen(2.5, -0.07);
  await page.mouse.click(a.x, a.y); await settle();
}
const wp = page.getByTestId('wall-properties');
check('Wand anklicken: Eigenschaften mit Länge 5,00 und Stärke 0,15', (await wp.count()) === 1 && (await valueOf(wp, 'Länge')) === 5 && (await valueOf(wp, 'Wandstärke')) === 0.15);
await setIn(wp, 'Länge', '5,5');
check('Wandlänge 5,50 m: Maßkette aktualisiert, Verlauf „Wandlänge ändern“', (await labels()).includes('5,50 m') && (await undoTitle()) === 'Wandlänge ändern rückgängig');
check('Folgende Wand parallel mitgeführt (bleibt 2,50 m)', (await labels()).includes('2,50 m'));
await setIn(wp, 'Wandstärke', '0,25');
check('Wandstärke 25 cm (3D-Körper), Verlauf „Wandstärke ändern“', (await wallBody('wall-1')).thickness === 0.25 && (await undoTitle()) === 'Wandstärke ändern rückgängig', JSON.stringify(await wallBody('wall-1')));
await key('ControlOrMeta+z'); await key('ControlOrMeta+z');
check('Undo: Länge und Stärke zurück', (await labels()).includes('5,00 m') && (await wallBody('wall-1')).thickness === 0.15);
// Ecke einfügen / entfernen
{
  const a = await toScreen(2.5, -0.07);
  await page.mouse.click(a.x, a.y); await settle();
}
await wp.getByTestId('wall-split').click(); await settle();
check('Ecke einfügen: sechs Wände, neue Ecke ausgewählt', (await room()).walls.length === 6 && (await page.getByTestId('corner-properties').count()) === 1 && (await undoTitle()) === 'Ecke einfügen rückgängig');
await dragCorner('wall-6', { x: 2.5, z: -0.8 });
check('Neue Ecke ziehen: Raum wird zum Fünfeck mit Spitze', (await room()).polygon.some((q) => q.z === 0 && q.x === 2.5) || (await room()).polygon.length === 6);
await page.getByTestId('corner-properties').getByTestId('corner-remove').click(); await settle();
check('Ecke entfernen: wieder fünf Wände', (await room()).walls.length === 5 && (await undoTitle()) === 'Ecke entfernen rückgängig');
// Wand entfernen (schräge Wand → Nachbarn verlängert)
{
  const a = await toScreen(4.25 + 0.05, 3.25 + 0.05);
  await page.mouse.click(a.x, a.y); await settle();
}
check('Schräge Wand ausgewählt', (await wp.count()) === 1 && (await wp.textContent()).includes('Wand 3'));
await wp.getByTestId('wall-remove').click(); await settle();
rm = await room();
check('Wand entfernen: Nachbarwände bis zur Ecke verlängert (4 Wände, Ecke 5/4)', rm.walls.length === 4 && rm.polygon.some((q) => q.x === 5 && q.z === 4), JSON.stringify(rm.polygon));
await key('ControlOrMeta+z');
// Entf auf Ecke
await page.locator('[data-testid="room-corner"][data-wall-id="wall-4"]').click(); await settle();
await key('Delete');
check('Entf auf ausgewählter Ecke entfernt sie', (await room()).walls.length === 4);
await key('ControlOrMeta+z');
check('Möbel nach allen Änderungen innerhalb der Kontur', await page.evaluate(async () => {
  const m = await import('/src/utils/polygon.ts');
  const g = window.__PLANNER_R3F__().scene.getObjectByName('room');
  const { polygon, origin } = g.userData;
  let ok = true;
  window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureId && !m.pointInPolygon({ x: o.position.x + origin.x, z: o.position.z + origin.z }, polygon)) ok = false; });
  return ok;
}));
// L-Form: Wand mit parallelen Nachbarn kann nicht entfernt werden
await roomPanel.getByTestId('room-edit-toggle').click(); await settle();
await setShape('L-Form'); // aus der freien Form 5 × 4 → über die Hauptmaße auf 6 × 5, Ausschnitt 2,5 × 2
for (const [label, value] of [['Gesamtbreite', '6'], ['Gesamtlänge', '5'], ['Ausschnitt Breite', '2,5'], ['Ausschnitt Länge', '2']]) await setIn(roomPanel, label, value);
check('L-Form-Hauptmaße eingeben: 6 / 3 / 2,5 / 2 / 3,5 / 5 m', JSON.stringify(await labels()) === '["2,00 m","2,50 m","3,00 m","3,50 m","5,00 m","6,00 m"]', JSON.stringify(await labels()));
await roomPanel.getByTestId('room-edit-toggle').click(); await settle(400);
{
  const a = await toScreen(4.75, 3.07);
  await page.mouse.click(a.x, a.y); await settle();
}
await wp.getByTestId('wall-remove').click(); await settle();
check('L-Form: Wand mit parallelen Nachbarn → verständliche Rückmeldung, nichts geändert', (await page.getByTestId('room-feedback').textContent()).includes('parallel') && (await room()).walls.length === 6);
await setIn(wp, 'Länge', '3');
check('L-Form: Wandlänge der Innenwand ändern (Aussparung 3,00 m breit)', (await labels()).filter((l) => l === '3,00 m').length >= 1 && (await room()).walls.length === 6);
await key('ControlOrMeta+z');
await roomPanel.getByTestId('room-edit-toggle').click(); await settle();
await shot('06-editor');

// ---------- 7. Gestaltung je Wand ----------
await page.getByTestId('wall-option-wall-3').click(); await settle();
await page.getByTestId('wall-preset').nth(6).click(); await settle(); // Terrakotta
check('Wandfarbe an Wand-ID gebunden (nur Wand 3)', (await wallBody('wall-3')).color === 'c98b6b' && (await wallBody('wall-4')).color === 'fbfbfa');
await page.getByTestId('wall-apply-all').click(); await settle();
check('„Auf alle Wände anwenden“: alle sechs Wände', (await Promise.all(['wall-1', 'wall-2', 'wall-3', 'wall-4', 'wall-5', 'wall-6'].map(wallBody))).every((w) => w.color === 'c98b6b'));
await page.getByTestId('floor-option-tiles').click(); await settle();
floor = await floorInfo();
check('Bodenbelag auf der gesamten L-Fläche', floor.material === 'tiles' && floor.area === 25);

// ---------- 8. Speichern / Laden ----------
const before = await room();
const furnitureBefore = await page.evaluate(() => { const out = {}; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureId) out[o.userData.furnitureId] = [+o.position.x.toFixed(3), +o.position.z.toFixed(3)]; }); return out; });
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('L-Raum');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichert (Version 7): Raum mit sechs Wänden (ID, Anfang, Ende, Höhe, Stärke), ohne Ursprung', stored.version === 7 && stored.plan.room.shape === 'l-shape' && stored.plan.room.walls.length === 6 && JSON.stringify(Object.keys(stored.plan.room.walls[0]).sort()) === '["end","height","id","start","thickness"]' && !('origin' in stored.plan.room) && stored.plan.design.wallColors['wall-3'] === '#c98b6b');
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'L-Raum' }).getByTestId('project-open').click(); await settle(700);
const after = await room();
const furnitureAfter = await page.evaluate(() => { const out = {}; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureId) out[o.userData.furnitureId] = [+o.position.x.toFixed(3), +o.position.z.toFixed(3)]; }); return out; });
check('Geladen: gleicher Umriss, gleiche Möbelpositionen, gespeichert-Status', JSON.stringify(after.polygon) === JSON.stringify(before.polygon) && JSON.stringify(furnitureAfter) === JSON.stringify(furnitureBefore) && (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved', JSON.stringify([after.polygon, furnitureAfter, furnitureBefore]));
check('Geladen: Wandfarben je Wand', (await wallBody('wall-3')).color === 'c98b6b');

// ---------- 9. Migration Version 3 (Rechteck) – identische Lage ----------
await page.evaluate(() => {
  localStorage.setItem('raumplaner:project:alt-v3', JSON.stringify({
    format: 'raumplaner-project', version: 3, id: 'alt-v3', name: 'Altes Rechteck', createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z',
    plan: {
      dimensions: { width: 5, length: 4, height: 2.5 },
      openings: [
        { id: 'opening-1', type: 'door', wall: 'south', offset: 1, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' },
        { id: 'opening-2', type: 'window', wall: 'west', offset: 0.5, width: 1.2, height: 1.2, sillHeight: 0.9, sashes: 1 },
      ],
      furniture: [{ id: 'furniture-1', type: 'sofa', name: 'Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2, z: 2 }, rotationDeg: 0 }],
      fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'west', offset: 2, width: 1, height: 0.6, depth: 0.1, elevation: 0.1 }],
      groups: [], design: { floor: 'wood-dark', wallColors: { north: '#fbfbfa', east: '#fbfbfa', south: '#a8b8c8', west: '#fbfbfa' } },
    },
  }));
});
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Altes Rechteck' }).getByTestId('project-open').click(); await settle(700);
await toggle('2D');
check('Version 3 öffnet ohne Warnung als Rechteck', (await page.getByTestId('project-notice').textContent()) === '„Altes Rechteck“ geöffnet.' && (await room()).shape === 'rectangle' && (await roomPanel.getByLabel('Breite', { exact: true }).inputValue()) === '5,00');
const geo = await page.evaluate(() => {
  const s = window.__PLANNER_R3F__().scene;
  const out = {};
  s.traverse((o) => {
    if (o.userData?.openingType) {
      const sym = o.getObjectByName(o.userData.openingType === 'door' ? 'door-plan-symbol' : 'window-plan-symbol') ?? o;
      o.updateWorldMatrix(true, true);
      const g = sym.children?.find((m) => m.isMesh)?.geometry ?? null;
      const mesh = sym.children?.find((m) => m.isMesh);
      if (mesh && g) { g.computeBoundingBox(); const b = g.boundingBox.clone().applyMatrix4(mesh.matrixWorld); out[o.userData.openingType] = [+b.min.x.toFixed(3), +b.max.x.toFixed(3), +b.min.z.toFixed(3), +b.max.z.toFixed(3)]; }
    }
    if (o.userData?.furnitureId) out.sofa = [+o.position.x.toFixed(3), +o.position.z.toFixed(3)];
    if (o.userData?.fixtureId) {
      const mesh = o.getObjectByName('radiator-plan-symbol').children.find((m) => m.isMesh);
      mesh.updateWorldMatrix(true, true);
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      out.radiator = [+b.min.x.toFixed(3), +b.max.x.toFixed(3), +b.min.z.toFixed(3), +b.max.z.toFixed(3)];
    }
  });
  return out;
});
// Erwartung wie im alten Rechteckmodell (Welt: Raum zentriert, Süd-/Westwand-Positionen von links/oben):
check('Migration: Tür Süd 1,00 m von links → Welt x −1,50 … −0,60', JSON.stringify(geo.door.slice(0, 2)) === '[-1.5,-0.6]', JSON.stringify(geo.door));
check('Migration: Fenster West 0,50 m von oben → Welt z −1,50 … −0,30', JSON.stringify(geo.window.slice(2)) === '[-1.5,-0.3]', JSON.stringify(geo.window));
check('Migration: Heizkörper West 2,00 m von oben → Welt z 0,00 … 1,00', near(geo.radiator[2], 0, 0.002) && near(geo.radiator[3], 1, 0.002), JSON.stringify(geo.radiator));
check('Migration: Möbel unverändert (Welt −0,50 / 0,00)', JSON.stringify(geo.sofa) === '[-0.5,0]', JSON.stringify(geo.sofa));
check('Migration: Wandfarbe Süd übernommen', (await wallBody('south')).color === 'a8b8c8');
await page.getByTestId('opening-list-item').filter({ hasText: 'Tür 1' }).click(); await settle();
check('Migration: Anzeige „Abstand von links“ 1,00 m wie zuvor', (await valueOf(op, 'Abstand von links')) === 1);
// Beschädigter Grundriss
await page.evaluate(() => {
  localStorage.setItem('raumplaner:project:kaputt-v4', JSON.stringify({
    format: 'raumplaner-project', version: 4, id: 'kaputt-v4', name: 'Kaputter Grundriss', createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z',
    plan: { room: { shape: 'free', height: 2.5, walls: [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 4 }, height: 2.5, thickness: 0.15 },
      { id: 'b', start: { x: 4, z: 4 }, end: { x: 4, z: 0 }, height: 2.5, thickness: 0.15 },
      { id: 'c', start: { x: 4, z: 0 }, end: { x: 0, z: 4 }, height: 2.5, thickness: 0.15 },
      { id: 'd', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, height: 2.5, thickness: 0.15 },
    ] }, openings: [], furniture: [], fixtures: [], groups: [], design: { floor: 'tiles', wallColors: {} } },
  }));
});
await page.getByTestId('projects-button').click(); await settle();
const brokenText = await page.locator('[data-project-id="kaputt-v4"]').textContent();
check('Beschädigter Grundriss: markiert, nicht zu öffnen', brokenText.includes('Grundriss ist ungültig') && !(await page.locator('[data-project-id="kaputt-v4"]').getByTestId('project-open').isEnabled()), brokenText);
// Neues Projekt mit L-Form
await page.getByTestId('project-new-shape').getByRole('button', { name: 'L-Form' }).click();
await page.getByTestId('project-new').click(); await settle(500);
if (await page.getByTestId('confirm-accept').count()) { await page.getByTestId('confirm-accept').click(); await settle(500); }
check('Neues Projekt mit L-Form: sechs Wände, Status neu', (await room()).walls.length === 6 && (await page.getByTestId('project-status').getAttribute('data-state')) === 'new');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
