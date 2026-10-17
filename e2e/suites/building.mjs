import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { exportFile } from '../lib/images.mjs';
import { openScene, rectangleWalls } from '../lib/scenes.mjs';

/**
 * Mehrere Zimmer und Etagen: Gebäude-Bereich, Nachbarzimmer (anklickbar), gemeinsame Wand mit
 * Tür (eine Wand, durchbrochen, Kollision mit dem Türschwenk), Umbenennen, Verschieben mit
 * Einrasten, Etagen (Geschossdecke, Etage darunter), Ziehen von Fenstern und Heizkörpern in
 * „3D Bearbeiten“, Speichern/Laden (Format 8) und Export der ganzen Etage.
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
const settle = (ms = 250) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

const panel = page.getByTestId('building-panel');
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const roomItems = () => panel.getByTestId('room-list-item').evaluateAll((els) => els.map((e) => ({ id: e.dataset.roomId, name: e.querySelector('span').textContent, active: e.getAttribute('aria-pressed') === 'true' })));
const activeRoom = async () => (await roomItems()).find((r) => r.active)?.id;
const setIn = async (scope, label, text) => { const i = scope.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const valueOf = async (scope, label) => num(await scope.getByLabel(label, { exact: true }).inputValue());
const toScreen = (x, y, z) => page.evaluate(([x, y, z]) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, y, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [x, y, z]);
/** Mitte (Hülle aller Meshes) eines benannten Objekts auf dem Bildschirm – zuerst gefunden wird das aktive Zimmer. */
const screenOf = (name) => page.evaluate((name) => {
  const s = window.__PLANNER_R3F__();
  const o = s.scene.getObjectByName(name);
  o.updateWorldMatrix(true, true);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  o.traverse((m) => {
    if (!m.isMesh || !m.geometry.attributes.position) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    min = min.map((v, i) => Math.min(v, bb.min.getComponent(i)));
    max = max.map((v, i) => Math.max(v, bb.max.getComponent(i)));
  });
  const v = s.camera.position.clone().set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, name);
/** Anzahl Eckpunkte einer Wandgeometrie (aktives Zimmer bzw. Nachbarzimmer `room`). */
const wallVertices = (wallId, room) => page.evaluate(([wallId, room]) => {
  const s = window.__PLANNER_R3F__();
  const scope = room ? s.scene.getObjectByName(`context-room-${room}`) : s.scene.getObjectByName('room');
  return scope?.getObjectByName(`wall-${wallId}-body`)?.geometry.attributes.position.count ?? -1;
}, [wallId, room]);
const camera = () => page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray().map((v) => +v.toFixed(4)));
async function restCamera() {
  let last = await camera();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const now = await camera();
    if (JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
  }
  return last;
}
async function mouseDrag(from, to, { steps = 12, during } = {}) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await settle(120);
  const live = during ? await during() : undefined;
  await page.mouse.up(); await settle();
  return live;
}

// ---------- 0. Neues Projekt: ein Zimmer, Bereich „Etagen & Zimmer“ ohne Liste
check('Start: Bereich „Etagen & Zimmer“ mit „Neues Zimmer“ und „Neue Etage“', (await panel.getByTestId('add-room').count()) === 1 && (await panel.getByTestId('add-floor').count()) === 1);
check('Start: ein Zimmer – keine Zimmerliste, keine Etagenauswahl, keine Nachbarzimmer', (await panel.getByTestId('room-list-item').count()) === 0 && (await page.getByTestId('floor-select').count()) === 0 && (await page.evaluate(() => !window.__PLANNER_R3F__().scene.getObjectByName('building-context'))));

// ---------- 1. Haus mit zwei Etagen öffnen (Format 8)
const design = (walls) => ({ floor: 'oak', wallColors: Object.fromEntries(walls.map((w) => [w.id, '#f4f1ec'])), wallFinishes: {}, ceilingColor: '#ffffff', lighting: { preset: 'daylight', brightness: 1 } });
const w1 = rectangleWalls(5, 4, 2.5);
const w2 = rectangleWalls(4, 4, 2.5);
const house = {
  format: 'raumplaner-project',
  version: 8,
  id: 'haus',
  name: 'Haus',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  plan: {
    room: { shape: 'rectangle', height: 2.5, walls: w1, origin: { x: 2.5, z: 2 } },
    openings: [{ id: 'opening-1', type: 'window', wall: 'north', offset: 1.5, width: 1.4, height: 1.3, sillHeight: 0.9, sashes: 2 }],
    furniture: [{ id: 'furniture-1', type: 'wardrobe', name: 'Schrank', width: 1, depth: 0.6, height: 2, position: { x: 4.6, z: 2.05 }, rotationDeg: 90 }],
    fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'north', offset: 3.3, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 }],
    groups: [],
    design: design(w1),
    building: {
      floors: [{ id: 'floor-1', name: 'Erdgeschoss' }, { id: 'floor-2', name: 'Obergeschoss' }],
      activeRoomId: 'room-1',
      rooms: [
        { id: 'room-1', name: 'Wohnen', floorId: 'floor-1' },
        {
          id: 'room-2',
          name: 'Flur',
          floorId: 'floor-1',
          doc: {
            room: { shape: 'rectangle', height: 2.5, walls: w2, origin: { x: -2.65, z: 2 } },
            // Tür in der gemeinsamen Wand; öffnet nach außen = ins Wohnzimmer.
            openings: [{ id: 'opening-1', type: 'door', wall: 'west', offset: 1.5, width: 0.9, height: 2.1, hinge: 'left', swing: 'outward' }],
            furniture: [{ id: 'furniture-2', type: 'dresser', name: 'Kommode', width: 1, depth: 0.45, height: 0.8, position: { x: 2, z: 0.3 }, rotationDeg: 0 }],
            fixtures: [],
            groups: [],
            design: design(w2),
          },
        },
        {
          id: 'room-3',
          name: 'Schlafen',
          floorId: 'floor-2',
          doc: { room: { shape: 'rectangle', height: 2.5, walls: w1, origin: { x: 2.5, z: 2 } }, openings: [], furniture: [], fixtures: [], groups: [], design: design(w1) },
        },
      ],
    },
  },
};
await openScene(page, house);
check('Etagenauswahl mit zwei Etagen, Erdgeschoss aktiv', (await page.getByTestId('floor-select').locator('option').count()) === 2 && (await page.getByTestId('floor-select').locator('select').inputValue()) === 'floor-1');
let items = await roomItems();
check('Zimmerliste der Etage: Wohnen (aktiv) und Flur mit Fläche', items.length === 2 && items[0].name === 'Wohnen' && items[0].active && items[1].name === 'Flur', JSON.stringify(items));
check('Nachbarzimmer in der Szene (Flur), Etage darunter keine', await page.evaluate(() => { const s = window.__PLANNER_R3F__().scene; return !!s.getObjectByName('context-room-room-2') && !s.getObjectByName('context-room-room-3'); }));

// Gemeinsame Wand: einmal gezeichnet (Wohnen hat Vorrang), Tür des Flurs durchbricht sie.
const plainWall = await wallVertices('west');
const sharedWall = await wallVertices('east');
const hiddenWall = await wallVertices('west', 'room-2');
check('Gemeinsame Wand: beim Flur entfällt sie ganz', hiddenWall === 0, String(hiddenWall));
check('Gemeinsame Wand: im Wohnzimmer mit Türöffnung (mehr Flächen als eine glatte Wand)', sharedWall > plainWall, `${plainWall} → ${sharedWall}`);

// Kollision: Schrank im Schwenkbereich der Flurtür.
await page.getByTestId('furniture-list-item').filter({ hasText: 'Schrank' }).click(); await settle();
const notices = await page.getByTestId('furniture-properties').getByTestId('collision-notice').allTextContents();
check('Kollision mit der Tür des Nachbarzimmers: „… Schwenkbereich von Tür zu „Flur““', notices.some((t) => t.includes('Schwenkbereich') && t.includes('Tür zu „Flur“')), JSON.stringify(notices));
await page.keyboard.press('Escape'); await settle();

// ---------- 2. Grundriss: alle Zimmer der Etage, Etiketten, Nachbar anklicken
await view('2D');
const labels = await page.getByTestId('room-label').evaluateAll((els) => els.map((e) => ({ text: e.textContent, active: e.dataset.active === 'true' })));
check('Grundriss: Etiketten „Wohnen 20,00 m²“ (aktiv) und „Flur 16,00 m²“', labels.length === 2 && labels.some((l) => l.text.includes('Wohnen') && l.text.includes('20,00 m²') && l.active) && labels.some((l) => l.text.includes('Flur') && l.text.includes('16,00 m²') && !l.active), JSON.stringify(labels));
const dims = await page.getByTestId('dimension-label').allTextContents();
check('Gemeinsame Wand ohne eigenes Wandmaß (es läge im Flur)', dims.filter((t) => t.trim() === '4,00 m').length === 1, JSON.stringify(dims));
await shot('01-grundriss-zwei-zimmer');
const undoBefore = await undoTitle();
const flurFloor = await toScreen(4.65, 0, 1.2);
await page.mouse.click(flurFloor.x, flurFloor.y); await settle(500);
check('Klick auf den Flur: Flur wird bearbeitet (ohne Verlaufsschritt)', (await activeRoom()) === 'room-2' && (await undoTitle()) === undoBefore);
check('Jetzt zeichnet der Flur die gemeinsame Wand, beim Wohnzimmer entfällt sie', (await wallVertices('west')) > 0 && (await wallVertices('east', 'room-1')) === 0);
await panel.getByTestId('room-list-item').filter({ hasText: 'Wohnen' }).click(); await settle(400);
check('Zimmerliste: zurück ins Wohnzimmer', (await activeRoom()) === 'room-1');

// ---------- 3. Umbenennen, Hinzufügen, Verschieben
await setIn(panel, 'Zimmername', 'Wohnzimmer');
check('Umbenennen: Liste aktualisiert, ein Schritt „Zimmer umbenennen“', (await roomItems())[0].name === 'Wohnzimmer' && (await undoTitle()) === 'Zimmer umbenennen rückgängig');
await panel.getByTestId('add-room').click(); await settle(600);
items = await roomItems();
check('Zimmer hinzufügen: drittes Zimmer der Etage, aktiv, ohne Überschneidung', items.length === 3 && items[2].active && (await page.getByTestId('room-overlap').count()) === 0, JSON.stringify(items));
check('Neues Zimmer Wand an Wand (unten, da rechts der Flur liegt)', near(await valueOf(panel, 'Lage oben'), 2.15) && near(await valueOf(panel, 'Lage links'), -2.5));
await page.keyboard.press('ControlOrMeta+z'); await settle(500);
check('Rückgängig: wieder zwei Zimmer', (await roomItems()).length === 2);

const x0 = await valueOf(panel, 'Lage links');
await setIn(panel, 'Lage links', String(x0 + 2).replace('.', ','));
check('Lage ändern: Zimmer überschneidet den Flur → Hinweis', (await page.getByTestId('room-overlap').count()) === 1 && (await page.getByTestId('room-overlap').textContent()).includes('Flur'));
await page.keyboard.press('ControlOrMeta+z'); await settle(400);
check('Rückgängig: alte Lage, kein Hinweis', near(await valueOf(panel, 'Lage links'), x0) && (await page.getByTestId('room-overlap').count()) === 0);

// Verschieben im Grundriss-Editor: kleine Bewegung rastet an der gemeinsamen Wand ein.
await page.getByTestId('room-edit-toggle').click(); await settle(700);
check('Grundriss-Editor: Griff „Zimmer verschieben“ (mehrere Zimmer)', (await page.getByTestId('room-move-handle').count()) === 1);
let handle = await page.getByTestId('room-move-handle').boundingBox();
let hc = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
await mouseDrag(hc, { x: hc.x - 4, y: hc.y + 3 }, { steps: 6 });
check('Kleine Bewegung: rastet an der Nachbarwand ein (Lage unverändert)', near(await valueOf(panel, 'Lage links'), x0) && near(await valueOf(panel, 'Lage oben'), -2));
handle = await page.getByTestId('room-move-handle').boundingBox();
hc = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
await mouseDrag(hc, { x: hc.x - 120, y: hc.y }, { steps: 10 });
const moved = await valueOf(panel, 'Lage links');
check('Ziehen: Zimmer verschoben, ein Schritt „Zimmer verschieben“', moved < x0 - 0.5 && (await undoTitle()) === 'Zimmer verschieben rückgängig', `${x0} → ${moved}`);
await page.keyboard.press('ControlOrMeta+z'); await settle(400);
check('Rückgängig: wieder an der gemeinsamen Wand', near(await valueOf(panel, 'Lage links'), x0));
await page.getByTestId('room-edit-toggle').click(); await settle(400);

// ---------- 4. Etagen
await page.getByTestId('floor-select').locator('select').selectOption('floor-2'); await settle(800);
check('Etage wechseln: Obergeschoss mit „Schlafen“', (await roomItems()).length === 1 && (await roomItems())[0].name === 'Schlafen');
check('Grundriss: Etage darunter als Umriss', await page.evaluate(() => !!window.__PLANNER_R3F__().scene.getObjectByName('lower-floor-room-1')));
await view('3D');
const lower = await page.evaluate(() => {
  const s = window.__PLANNER_R3F__().scene;
  return { y: s.getObjectByName('context-room-room-1')?.position.y, slab: !!s.getObjectByName('floor-slab') };
});
check('3D: Erdgeschoss liegt darunter (−2,75 m), Geschossdecke sichtbar', near(lower.y, -2.75, 1e-6) && lower.slab, JSON.stringify(lower));
await shot('02-obergeschoss-3d');
await panel.getByTestId('add-floor').click(); await settle(800);
check('Etage hinzufügen: drei Etagen, neue aktiv', (await page.getByTestId('floor-select').locator('option').count()) === 3 && (await page.getByTestId('floor-select').locator('select').inputValue()) !== 'floor-2');
await page.keyboard.press('ControlOrMeta+z'); await settle(600);
check('Rückgängig: zwei Etagen', (await page.getByTestId('floor-select').locator('option').count()) === 2);
await page.getByTestId('floor-select').locator('select').selectOption('floor-1'); await settle(800);

// ---------- 5. 3D: Fenster und Heizkörper ziehen
await page.getByTestId('opening-list-item').first().click(); await settle(400);
const op = page.getByTestId('opening-properties');
const left0 = await valueOf(op, 'Abstand von links');
let cam0 = await restCamera();
let win = await screenOf('opening-1');
const live = await mouseDrag(win, { x: win.x + 90, y: win.y }, { during: async () => ({ left: await valueOf(op, 'Abstand von links'), cam: await camera() }) });
const left1 = await valueOf(op, 'Abstand von links');
check('3D: ausgewähltes Fenster folgt dem Zeiger entlang der Wand (live)', Math.abs(live.left - left0) > 0.2 && left1 > left0 + 0.2, `${left0} → ${live.left} → ${left1}`);
check('3D: Kamera bleibt beim Ziehen stehen', JSON.stringify(live.cam) === JSON.stringify(cam0) && JSON.stringify(await camera()) === JSON.stringify(cam0));
check('3D: ein Schritt „Fenster verschieben“, Wand bleibt', (await undoTitle()) === 'Fenster verschieben rückgängig' && (await op.getByLabel('Wand').inputValue()) === 'north');
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: Fenster exakt zurück', near(await valueOf(op, 'Abstand von links'), left0));
await op.getByRole('button', { name: 'Auswahl aufheben' }).click(); await settle();

cam0 = await restCamera();
const rad = await screenOf('fixture-1');
await mouseDrag(rad, { x: rad.x + 80, y: rad.y - 20 });
const camAfter = await restCamera();
check('3D: nicht ausgewählter Heizkörper – Ziehen dreht die Kamera, Objekt bleibt', JSON.stringify(camAfter) !== JSON.stringify(cam0) && (await page.getByTestId('fixture-properties').count()) === 0);
await page.getByTestId('fixture-list-item').first().click(); await settle(400);
const fx = page.getByTestId('fixture-properties');
const fx0 = await valueOf(fx, 'Abstand von links');
const rad2 = await screenOf('fixture-1');
const fxLive = await mouseDrag(rad2, { x: rad2.x - 80, y: rad2.y }, { during: async () => valueOf(fx, 'Abstand von links') });
const fx1 = await valueOf(fx, 'Abstand von links');
check('3D: ausgewählter Heizkörper lässt sich entlang der Wand ziehen', Math.abs(fx1 - fx0) > 0.2 && Math.abs(fxLive - fx0) > 0.2, `${fx0} → ${fx1}`);
check('3D: ein Schritt „Heizkörper verschieben“', (await undoTitle()) === 'Heizkörper verschieben rückgängig');
await page.keyboard.press('Escape'); await settle();
await view('2D');

// ---------- 6. Speichern und Laden
await page.getByTestId('project-save').click(); await settle(400);
if (await page.getByTestId('save-project-dialog').count()) {
  const input = page.getByTestId('save-project-dialog').getByLabel('Projektname');
  await input.fill('Haus'); await input.press('Enter'); await settle(300);
}
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:haus')));
check('Gespeichert (Version 8): Etagen, Zimmer mit Lage, aktives Zimmer', stored.version === 8 && stored.plan.building.floors.length === 2 && stored.plan.building.rooms.length === 3 && stored.plan.building.rooms[1].doc.room.origin.x === -2.65 && 'origin' in stored.plan.room && stored.plan.building.rooms[0].name === 'Wohnzimmer');
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
if (await page.getByTestId('recovery-discard').count()) { await page.getByTestId('recovery-discard').click(); await settle(); }
await page.getByTestId('projects-button').click(); await settle();
await page.locator('[data-project-id="haus"]').getByTestId('project-open').click(); await settle(900);
if (await page.getByTestId('confirm-accept').count()) { await page.getByTestId('confirm-accept').click(); await settle(800); }
items = await roomItems();
check('Nach dem Neuladen: Zimmer, Namen und Etagen wieder da', items.length === 2 && items[0].name === 'Wohnzimmer' && (await page.getByTestId('floor-select').locator('option').count()) === 2, JSON.stringify(items));

// ---------- 7. Export der ganzen Etage
await page.evaluate(() => {
  window.__texts = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { window.__texts.push(String(text)); return original.call(this, text, ...rest); };
});
await page.getByTestId('export-button').click(); await settle();
const png = await exportFile(page, 'export-plan-png');
const texts = await page.evaluate(() => window.__texts);
check('Grundriss-PNG: ganze Etage mit Zimmernamen, Möbeln beider Zimmer und Gesamtfläche', ['Wohnzimmer', 'Flur', 'Schrank', 'Kommode'].every((t) => texts.includes(t)) && texts.some((t) => t.includes('Fläche gesamt 36,00 m²')), JSON.stringify(texts.filter((t) => !/^\d/.test(t)).slice(0, 20)));
fs.copyFileSync(png.path, `${OUT}/03-etage.png`);
const pdf = await exportFile(page, 'export-pdf');
const pdfText = fs.readFileSync(pdf.path).toString('latin1');
check('PDF: Übersicht „Zimmer und Etagen“ mit allen Zimmern', pdfText.includes('Zimmer und Etagen \\(3 Zimmer') && ['Wohnzimmer', 'Flur', 'Schlafen', 'Obergeschoss'].every((t) => pdfText.includes(t)));
await page.keyboard.press('Escape'); await settle();

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} bestanden`);
process.exit(passed === results.length ? 0 : 1);
