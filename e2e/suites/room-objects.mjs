import { chromium } from 'playwright-core';
import { addFurniture as addFromLibrary } from '../lib/planner.mjs';

/**
 * Raumobjekte (Heizkörper, Steckdose, Lichtschalter), Türanschlag und Öffnungsrichtung,
 * Fensterarten, Kollisionen, Undo/Redo, Speichern/Laden, Migration und 2D/3D-Abgleich.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.0051) => Math.abs(a - b) <= tol;
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
const W = 5, L = 4, T = 0.15;

const fx = page.getByTestId('fixture-properties');
const op = page.getByTestId('opening-properties');
const fp = page.getByTestId('furniture-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const valueOf = async (panel, label) => num(await panel.getByLabel(label, { exact: true }).inputValue());
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const notices = (panel) => panel.getByTestId('collision-notice').evaluateAll((els) => els.map((e) => e.textContent.trim()));
const pressed = (testId) => page.getByTestId(testId).locator('[aria-pressed="true"]').getAttribute('data-value');
const fixtureNames = () => page.getByTestId('fixture-list-item').evaluateAll((els) => els.map((e) => e.textContent.trim()));
const selectFixture = async (name) => { await page.getByTestId('fixture-list-item').filter({ hasText: name }).click(); await settle(); };
const selectOpening = async (name) => { await page.getByTestId('opening-list-item').filter({ hasText: name }).click(); await settle(); };
const selectFurniture = async (name) => { await page.getByTestId('furniture-list-item').filter({ hasText: name }).click(); await settle(); };
const addFurniture = async (type) => { await addFromLibrary(page, type); await settle(); };
const placeFurniture = async (x, z, r = '0') => { await setIn(fp, 'Rotation', r); await setIn(fp, 'X-Position', x); await setIn(fp, 'Z-Position', z); };

/** Bounding-Box aller Meshes/Linien eines Teils in Grundrisskoordinaten. */
const extent = (ownerKey, ownerValue, partName) => page.evaluate(({ ownerKey, ownerValue, partName, W, L }) => {
  const { scene } = window.__PLANNER_R3F__();
  let owner = null;
  scene.traverse((o) => { if (o.userData?.[ownerKey] === ownerValue && (!partName || o.getObjectByName(partName))) owner = o; });
  if (!owner) return null;
  const part = partName ? owner.getObjectByName(partName) : owner;
  part.updateWorldMatrix(true, true);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  part.traverse((o) => {
    const g = o.geometry; if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox; if (!b || !Number.isFinite(b.min.x)) return;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const v = b.min.clone().set(x, y, z).applyMatrix4(o.matrixWorld);
      [v.x, v.y, v.z].forEach((c, i) => { min[i] = Math.min(min[i], c); max[i] = Math.max(max[i], c); });
    }
  });
  const r = (v) => Math.round(v * 1000) / 1000;
  return { x0: r(min[0] + W / 2), x1: r(max[0] + W / 2), y0: r(min[1]), y1: r(max[1]), z0: r(min[2] + L / 2), z1: r(max[2] + L / 2) };
}, { ownerKey, ownerValue, partName, W, L });
const fixtureInfo = () => page.evaluate(() => {
  const out = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.fixtureId && out.push({ id: o.userData.fixtureId, type: o.userData.fixtureType }));
  return out;
});
const openingData = (id) => page.evaluate((id) => { let d = null; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.openingId === id) d = o.userData; }); return d; }, id);
const countNamed = (name) => page.evaluate((name) => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => o.name === name && n++); return n; }, name);

const toScreen = (x, z, y = 0.02) => page.evaluate(({ x, z, y }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, y, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2, y });
async function drag(from, to, { escape = false } = {}) {
  const a = await toScreen(from.x, from.z);
  const b = await toScreen(to.x, to.z);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await settle(120);
  if (escape) { await page.keyboard.press('Escape'); await settle(100); }
  await page.mouse.up(); await settle(200);
}

// ---------- 1. Heizkörper anlegen ----------
check('Bereich „Raumobjekte“ mit drei Buttons', (await page.getByTestId('fixtures-panel').count()) === 1 && (await page.getByTestId('add-radiator').count()) === 1 && (await page.getByTestId('add-socket').count()) === 1 && (await page.getByTestId('add-switch').count()) === 1);
const sectionOrder = await page.locator('aside section h2').evaluateAll((els) => els.map((e) => e.textContent));
check('Sidebar-Reihenfolge: Raum, Bauelemente, Raumobjekte, Möbel, Gestaltung', JSON.stringify(sectionOrder) === '["Raummaße","Bauelemente","Raumobjekte","Möbel","Gestaltung"]', JSON.stringify(sectionOrder));
await page.getByTestId('add-radiator').click(); await settle();
check('Heizkörper 1 angelegt und ausgewählt', JSON.stringify(await fixtureNames()) === '["Heizkörper 1Nord"]' && (await fx.getByTestId('fixture-name').textContent()) === 'Heizkörper 1', JSON.stringify(await fixtureNames()));
check('Standardmaße 100 × 60 × 10 cm, 10 cm über dem Boden', (await valueOf(fx, 'Breite')) === 1 && (await valueOf(fx, 'Höhe')) === 0.6 && (await valueOf(fx, 'Tiefe')) === 0.1 && (await valueOf(fx, 'Abstand zum Boden')) === 0.1);
check('Nordwand, mittig (Abstand von links 2,00 m)', (await fx.getByLabel('Wand').inputValue()) === 'north' && (await valueOf(fx, 'Abstand von links')) === 2);
check('Verlauf: „Heizkörper hinzufügen“', (await undoTitle()) === 'Heizkörper hinzufügen rückgängig');
const [radiator] = await fixtureInfo();
let e3 = await extent('fixtureId', radiator.id, 'radiator-model');
check('3D: Heizkörper an der Nordwand-Innenseite (x 2,00–3,00, z 0–0,10, Höhe 0,10–0,70)', near(e3.x0, 2, 0.01) && near(e3.x1, 3, 0.01) && near(e3.z0, 0, 0.01) && near(e3.z1, 0.1, 0.01) && near(e3.y0, 0.08, 0.03) && near(e3.y1, 0.7, 0.01), JSON.stringify(e3));
check('3D: Rippen erkennbar (≥ 15 Glieder)', await page.evaluate((id) => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.fixtureId === id) n = o.getObjectByName('radiator-model').children.length; }); return n; }, radiator.id) >= 18);
await shot('01-radiator-3d');

// ---------- 2. Heizkörper bearbeiten ----------
await setIn(fx, 'Breite', '1,2');
await setIn(fx, 'Abstand zum Boden', '0,15');
check('Breite/Abstand zum Boden übernommen', (await valueOf(fx, 'Breite')) === 1.2 && (await valueOf(fx, 'Abstand zum Boden')) === 0.15);
check('Verlauf: „Heizkörper ändern“', (await undoTitle()) === 'Heizkörper ändern rückgängig');
e3 = await extent('fixtureId', radiator.id, 'radiator-model');
check('3D folgt sofort (Breite 1,20, Unterkante 0,15)', near(e3.x1 - e3.x0, 1.2, 0.01) && near(e3.y1, 0.75, 0.01), JSON.stringify(e3));
await setIn(fx, 'Abstand von links', '9');
check('Abstand auf Wandlänge begrenzt (5 − 1,20 = 3,80)', (await valueOf(fx, 'Abstand von links')) === 3.8);
await setIn(fx, 'Abstand von links', '1');
await key('ControlOrMeta+z');
check('Undo: Abstand wieder 3,80', (await valueOf(fx, 'Abstand von links')) === 3.8);
await key('ControlOrMeta+Shift+z');
check('Redo: Abstand wieder 1,00', (await valueOf(fx, 'Abstand von links')) === 1);

// ---------- 3. 2D: Symbol und Ziehen entlang der Wand ----------
await toggle('2D');
check('2D: Grundriss-Symbol des Heizkörpers', (await countNamed('radiator-plan-symbol')) === 1 && (await countNamed('radiator-model')) === 0);
let e2 = await extent('fixtureId', radiator.id, 'radiator-plan-symbol');
check('2D: Symbol exakt an der Wand (x 1,00–2,20, z 0–0,10)', near(e2.x0, 1, 0.01) && near(e2.x1, 2.2, 0.01) && near(e2.z0, 0, 0.01) && near(e2.z1, 0.1, 0.01), JSON.stringify(e2));
await drag({ x: 1.6, z: 0.05 }, { x: 2.6, z: 0.05 });
check('Ziehen entlang der Wand (+1 m → Abstand 2,00)', near(await valueOf(fx, 'Abstand von links'), 2, 0.02), String(await valueOf(fx, 'Abstand von links')));
check('Verlauf: „Heizkörper verschieben“', (await undoTitle()) === 'Heizkörper verschieben rückgängig');
await drag({ x: 2.6, z: 0.05 }, { x: 4.95, z: 2 });
check('Ziehen auf die Ostwand wechselt die Wand', (await fx.getByLabel('Wand').inputValue()) === 'east', await fx.getByLabel('Wand').inputValue());
e2 = await extent('fixtureId', radiator.id, 'radiator-plan-symbol');
check('2D: an der Ostwand senkrecht (x 4,90–5,00, Länge 1,20)', near(e2.x0, 4.9, 0.01) && near(e2.x1, 5, 0.01) && near(e2.z1 - e2.z0, 1.2, 0.01), JSON.stringify(e2));
const beforeEsc = await valueOf(fx, 'Abstand von oben');
await drag({ x: 4.95, z: beforeEsc + 0.6 }, { x: 4.95, z: 0.8 }, { escape: true });
check('Esc bricht das Ziehen ab', (await valueOf(fx, 'Abstand von oben')) === beforeEsc && (await fx.getByLabel('Wand').inputValue()) === 'east');
await key('ControlOrMeta+z');
check('Undo: zurück an die Nordwand', (await fx.getByLabel('Wand').inputValue()) === 'north');

// ---------- 4. Kollision Heizkörper ↔ Möbel ----------
await addFurniture('sofa'); // 2,00 × 0,90 × 0,85
await placeFurniture('3', '0,45');
let n = await notices(fp);
check('Möbel vor dem Heizkörper → Warnung', n.includes('Dieses Möbel überschneidet sich mit Heizkörper 1.'), JSON.stringify(n));
check('Beide markiert (Listen-Punkte)', (await page.getByTestId('fixture-list-item').locator('[data-severity]').count()) === 1 && (await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa 1' }).locator('[data-severity]').count()) === 1);
check('2D: Heizkörper rot markiert', await page.evaluate((id) => { let c = null; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.fixtureId === id) c = o.getObjectByName('radiator-plan-symbol').children.find((m) => m.isMesh).material.color.getHexString(); }); return c; }, radiator.id) === 'fde3e1');
await selectFixture('Heizkörper 1');
n = await notices(fx);
check('Heizkörper: „Der Heizkörper wird durch Sofa 1 verdeckt.“', n.includes('Der Heizkörper wird durch Sofa 1 verdeckt.'), JSON.stringify(n));
await setIn(fx, 'Abstand zum Boden', '0,9');
check('Heizkörper über dem Sofa (0,90–1,50) → keine Kollision (Höhe beachtet)', (await notices(fx)).length === 0);
await setIn(fx, 'Abstand zum Boden', '0,1');
await selectFurniture('Sofa 1'); await setIn(fp, 'Z-Position', '0,55');
check('Sofa bündig vor dem Heizkörper (Kante an Kante) → keine Kollision', (await notices(fp)).length === 0);
await setIn(fp, 'Z-Position', '0,54');
check('1 cm Überlappung → Kollision', (await notices(fp)).length === 1);
await setIn(fp, 'Z-Position', '2,5');
await shot('02-radiator-2d');

// ---------- 5. Steckdose und Lichtschalter ----------
await page.getByTestId('add-socket').click(); await settle();
check('Steckdose 1: Ostwand, Höhe (Mitte) 0,30 m, feste Größe', (await fx.getByTestId('fixture-name').textContent()) === 'Steckdose 1' && (await fx.getByLabel('Wand').inputValue()) === 'east' && (await valueOf(fx, 'Höhe (Mitte)')) === 0.3 && (await fx.getByLabel('Breite', { exact: true }).count()) === 0);
await setIn(fx, 'Höhe (Mitte)', '0,4');
check('Höhe (Mitte) bearbeitbar', (await valueOf(fx, 'Höhe (Mitte)')) === 0.4);
await setIn(fx, 'Abstand von oben', '1,5');
const fixtures = await fixtureInfo();
const socket = fixtures.find((f) => f.type === 'socket');
check('2D: Steckdosen-Symbol', (await countNamed('socket-plan-symbol')) === 1);
e2 = await extent('fixtureId', socket.id, 'socket-plan-symbol');
check('2D: Symbol an der Ostwand-Innenseite (Mitte bei 1,54)', e2.x1 <= 5.001 && e2.x0 > 4.7 && near((e2.z0 + e2.z1) / 2, 1.54, 0.02), JSON.stringify(e2));
await page.getByTestId('add-switch').click(); await settle();
check('Lichtschalter 1: Südwand, Höhe (Mitte) 1,05 m', (await fx.getByTestId('fixture-name').textContent()) === 'Lichtschalter 1' && (await fx.getByLabel('Wand').inputValue()) === 'south' && (await valueOf(fx, 'Höhe (Mitte)')) === 1.05);
check('2D: Schalter-Symbol', (await countNamed('switch-plan-symbol')) === 1);
// Keine Kollision mit Möbeln
await selectFurniture('Sofa 1'); await placeFurniture('4,55', '1,54', '90');
check('Sofa vor der Steckdose: keine Kollision', (await notices(fp)).length === 0 && (await page.getByTestId('fixture-list-item').locator('[data-severity]').count()) === 0);
// Auswahl im Grundriss per Klick
await placeFurniture('2,5', '1,2');
const sw = (await fixtureInfo()).find((f) => f.type === 'switch');
const swExt = await extent('fixtureId', sw.id, 'switch-plan-symbol');
const swPoint = await toScreen((swExt.x0 + swExt.x1) / 2, swExt.z1 - 0.03);
await page.mouse.click(swPoint.x, swPoint.y); await settle();
check('2D: Klick auf Schalter-Symbol wählt ihn aus', (await fx.count()) === 1 && (await fx.getByTestId('fixture-name').textContent()) === 'Lichtschalter 1');
await toggle('3D');
check('3D: Steckdose und Schalter als dezente Modelle', (await countNamed('socket-model')) === 1 && (await countNamed('switch-model')) === 1);
e3 = await extent('fixtureId', sw.id, 'switch-model');
check('3D: Schalter in 1,01–1,09 m Höhe an der Südwand', near(e3.y0, 1.01, 0.01) && near(e3.y1, 1.09, 0.01) && e3.z1 <= 4.001 && e3.z0 > 3.95, JSON.stringify(e3));
await shot('03-fixtures-3d');
await toggle('2D');
// Löschen
await key('Delete');
check('Entf löscht den ausgewählten Schalter', JSON.stringify((await fixtureInfo()).map((f) => f.type).sort()) === '["radiator","socket"]');
check('Verlauf: „Lichtschalter löschen“', (await undoTitle()) === 'Lichtschalter löschen rückgängig');
await key('ControlOrMeta+z');
check('Undo stellt ihn wieder her', (await fixtureInfo()).length === 3);
await selectFixture('Steckdose 1');
await fx.getByTestId('delete-fixture').click(); await settle();
check('„Steckdose löschen“-Button', (await fixtureInfo()).length === 2 && (await fx.count()) === 0);
await key('ControlOrMeta+z');

// ---------- 6. Türanschlag und Öffnungsrichtung ----------
await page.getByTestId('add-door').click(); await settle();
const doorId = (await page.evaluate(() => { const ids = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.openingType === 'door' && ids.push(o.userData.openingId)); return ids; }))[0];
check('Neue Tür: Südwand, Anschlag „Rechts“, öffnet nach innen (bisheriges Verhalten)', (await op.getByLabel('Wand').inputValue()) === 'south' && (await pressed('door-hinge')) === 'right' && (await pressed('door-swing')) === 'inward');
await setIn(op, 'Breite', '1,2'); // Abstand 2,05 → Tür x 2,05–3,25
// Kleiner Nachttisch in der Ecke gegenüber dem Anschlag: außerhalb des Bogens.
await addFurniture('nightstand');
await setIn(fp, 'Breite', '0,3'); await setIn(fp, 'Tiefe', '0,3');
await placeFurniture('3,1', '2,95');
check('Anschlag rechts (Band bei x 2,05): Ecke außerhalb des Bogens frei', (await notices(fp)).length === 0, JSON.stringify(await notices(fp)));
let sym = await extent('openingId', doorId, 'door-leaf-line');
check('2D: Türblatt am Band (x ≈ 2,05), geöffnet in den Raum (z 2,80–4,00)', near(sym.x0, 2.05, 0.02) && near(sym.z0, 2.8, 0.02) && near(sym.z1, 4, 0.02), JSON.stringify(sym));
await selectOpening('Tür 1');
await op.getByTestId('door-hinge').getByRole('button', { name: 'Links' }).click(); await settle();
check('Verlauf: „Türanschlag ändern“', (await undoTitle()) === 'Türanschlag ändern rückgängig');
sym = await extent('openingId', doorId, 'door-leaf-line');
check('2D: Anschlag links → Türblatt an der anderen Kante (x ≈ 3,25)', near(sym.x0, 3.25, 0.02) && near(sym.x1, 3.25, 0.02), JSON.stringify(sym));
n = await notices(op);
check('Schwenkbereich folgt dem Anschlag → Nachttisch jetzt im Schwenkbereich', n.some((t) => t.startsWith('Der Schwenkbereich der Tür wird durch Nachttisch 1 blockiert')), JSON.stringify(n));
check('Tür-Daten in der Szene: hinge left', (await openingData(doorId)).hinge === 'left');
await op.getByTestId('door-swing').getByRole('button', { name: 'Außen' }).click(); await settle();
check('Verlauf: „Öffnungsrichtung ändern“', (await undoTitle()) === 'Öffnungsrichtung ändern rückgängig');
sym = await extent('openingId', doorId, 'door-leaf-line');
check('2D: nach außen → Türblatt vor der Außenseite der Wand (z 4,15–5,35)', near(sym.z0, 4 + T, 0.02) && near(sym.z1, 4 + T + 1.2, 0.02), JSON.stringify(sym));
const arc = await extent('openingId', doorId, 'door-arc');
check('2D: Öffnungsbogen ebenfalls außen', arc.z0 >= 4 + T - 0.01 && near(arc.z1, 4 + T + 1.2, 0.02), JSON.stringify(arc));
check('Nach außen: Schwenkbereich außerhalb → keine Kollision', (await notices(op)).length === 0);
await shot('04-door-outward-2d');
await toggle('3D');
let leaf = await extent('openingId', doorId, 'door-leaf');
check('3D: Türblatt außen (hinter der Südwand) an der linken Kante (vom Raum aus)', leaf.z0 > 4 + T - 0.01 && near((leaf.x0 + leaf.x1) / 2, 3.25 - 0.07, 0.03), JSON.stringify(leaf));
await toggle('2D');
await op.getByTestId('door-swing').getByRole('button', { name: 'Innen' }).click(); await settle();
await op.getByTestId('door-hinge').getByRole('button', { name: 'Rechts' }).click(); await settle();
await toggle('3D');
leaf = await extent('openingId', doorId, 'door-leaf');
check('3D: nach innen, Anschlag rechts → Türblatt im Raum bei x ≈ 2,05', leaf.z1 < 4.01 && leaf.z0 < 3 && near((leaf.x0 + leaf.x1) / 2, 2.05 + 0.07, 0.03), JSON.stringify(leaf));
await toggle('2D');
check('Zurück auf rechts/innen: wieder keine Kollision', (await notices(op)).length === 0);
// Anschlag innen, Möbel nahe am Band → Kollision; außen → frei
await selectFurniture('Nachttisch 1'); await placeFurniture('2,3', '3,75');
check('Möbel am Band im Schwenkbereich (innen) → Kollision', (await notices(fp)).some((t) => t.includes('Schwenkbereich von Tür 1')));
await selectOpening('Tür 1');
await op.getByTestId('door-swing').getByRole('button', { name: 'Außen' }).click(); await settle();
check('… nach außen öffnend → frei', (await notices(op)).length === 0);

// ---------- 7. Fensterarten ----------
await page.getByTestId('add-window').click(); await settle();
const windowId = (await page.evaluate(() => { const ids = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.openingType === 'window' && ids.push(o.userData.openingId)); return ids; }))[0];
check('Neues Fenster: einflügelig, Brüstung wie bisher', (await pressed('window-sashes')) === '1' && (await valueOf(op, 'Brüstungshöhe')) === 0.9);
check('2D: kein Mittelpfosten', await page.evaluate((id) => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.openingId === id) o.traverse((c) => c.name === 'window-mullion' && n++); }); return n; }, windowId) === 0);
await op.getByTestId('window-sashes').getByRole('button', { name: 'Zweiflügelig' }).click(); await settle();
check('Zweiflügelig: Mittelpfosten im Grundriss', await page.evaluate((id) => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.openingId === id) o.traverse((c) => c.name === 'window-mullion' && n++); }); return n; }, windowId) === 1);
check('Verlauf: „Fensterart ändern“', (await undoTitle()) === 'Fensterart ändern rückgängig');
await toggle('3D');
const frameBars = await page.evaluate((id) => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.openingId === id) o.traverse((c) => c.isMesh && c.geometry.type === 'BoxGeometry' && c.name !== 'window-glass' && n++); }); return n; }, windowId);
check('3D: Rahmen mit Mittelpfosten (5 Rahmenteile)', frameBars === 5, String(frameBars));
await shot('05-window-3d');
await toggle('2D');

// ---------- 8. Speichern und Laden ----------
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Raumobjekte');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
const sDoor = stored.plan.openings.find((o) => o.type === 'door');
const sWin = stored.plan.openings.find((o) => o.type === 'window');
check('Gespeichert: Version 5, Raumobjekte, Anschlag/Richtung, Fensterart', stored.version === 5 && stored.plan.fixtures.length === 3 && sDoor.hinge === 'right' && sDoor.swing === 'outward' && sWin.sashes === 2 && Array.isArray(stored.plan.groups), JSON.stringify({ sDoor, sWin }));
check('Gespeicherter Heizkörper vollständig', JSON.stringify(Object.keys(stored.plan.fixtures.find((f) => f.type === 'radiator')).sort()) === JSON.stringify(['depth', 'elevation', 'height', 'id', 'offset', 'type', 'wall', 'width']));
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
check('Nach Neuladen: leerer Plan', (await page.getByTestId('fixture-list-item').count()) === 0);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Raumobjekte' }).getByTestId('project-open').click(); await settle(600);
check('Geöffnet: 3 Raumobjekte', (await page.getByTestId('fixture-list-item').count()) === 3);
await selectOpening('Tür 1');
check('Geöffnet: Tür rechts/außen', (await pressed('door-hinge')) === 'right' && (await pressed('door-swing')) === 'outward');
await selectOpening('Fenster 1');
check('Geöffnet: Fenster zweiflügelig', (await pressed('window-sashes')) === '2');
await selectFixture('Heizkörper 1');
check('Geöffnet: Heizkörper-Werte', (await valueOf(fx, 'Breite')) === 1.2 && near(await valueOf(fx, 'Abstand von links'), 2, 0.02) && (await fx.getByLabel('Wand').inputValue()) === 'north');
check('Geöffnet: Status „Gespeichert“', (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');

// ---------- 9. Migration alter Projekte ----------
await page.evaluate(() => {
  const base = { format: 'raumplaner-project', createdAt: '2026-02-01T08:00:00.000Z', updatedAt: '2026-02-01T08:00:00.000Z' };
  localStorage.setItem('raumplaner:project:alt-v2', JSON.stringify({
    ...base, version: 2, id: 'alt-v2', name: 'Altprojekt V2',
    plan: {
      dimensions: { width: 5, length: 4, height: 2.5 },
      openings: [
        { id: 'opening-1', type: 'door', wall: 'north', offset: 1, width: 0.9, height: 2.1 },
        { id: 'opening-2', type: 'door', wall: 'west', offset: 1, width: 0.9, height: 2.1 },
        { id: 'opening-3', type: 'window', wall: 'east', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 },
      ],
      furniture: [{ id: 'furniture-1', type: 'nightstand', name: 'Am Band', width: 0.45, depth: 0.4, height: 0.55, position: { x: 1.3, z: 0.3 }, rotationDeg: 0 }],
      design: { floor: 'wood-light', wallColors: { north: '#fbfbfa', east: '#fbfbfa', south: '#fbfbfa', west: '#fbfbfa' } },
    },
  }));
  localStorage.setItem('raumplaner:project:alt-v1b', JSON.stringify({
    ...base, version: 1, id: 'alt-v1b', name: 'Altprojekt V1',
    plan: { dimensions: { width: 4, length: 4, height: 2.5 }, openings: [{ id: 'opening-1', type: 'door', wall: 'south', offset: 1, width: 0.9, height: 2.1 }], furniture: [] },
  }));
  localStorage.setItem('raumplaner:project:v3-defekt', JSON.stringify({
    ...base, version: 3, id: 'v3-defekt', name: 'Defekte Details',
    plan: {
      dimensions: { width: 5, length: 4, height: 2.5 },
      openings: [{ id: 'opening-1', type: 'door', wall: 'north', offset: 1, width: 0.9, height: 2.1, hinge: 'oben', swing: 'inward' }],
      furniture: [
        { id: 'furniture-1', type: 'chair', name: 'A', width: 0.45, depth: 0.52, height: 0.9, position: { x: 3, z: 3 }, rotationDeg: 0 },
      ],
      fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'south', offset: 9, width: 1, height: 0.6, depth: 0.1, elevation: 0.1 }, { id: 'fixture-2', type: 'lampe', wall: 'south', offset: 1, elevation: 1 }],
      groups: [{ id: 'group-1', name: 'Kaputt', memberIds: ['furniture-1', 'gibt-es-nicht'] }],
      design: { floor: 'wood-light', wallColors: { north: '#fbfbfa', east: '#fbfbfa', south: '#fbfbfa', west: '#fbfbfa' } },
    },
  }));
});
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Altprojekt V2' }).getByTestId('project-open').click(); await settle(600);
check('Version 2 öffnet ohne Warnung', (await page.getByTestId('project-notice').textContent()) === '„Altprojekt V2“ geöffnet.', await page.getByTestId('project-notice').textContent());
check('Version 2: keine Raumobjekte', (await page.getByTestId('fixture-list-item').count()) === 0);
await selectOpening('Tür 1');
check('Migration: Tür an Nordwand → Anschlag links (Band wie bisher am Grundriss-Anfang), nach innen', (await pressed('door-hinge')) === 'left' && (await pressed('door-swing')) === 'inward');
n = await notices(op);
check('Migration: Schwenkbereich unverändert (Nachttisch am Band kollidiert wie zuvor)', n.some((t) => t.includes('Am Band')), JSON.stringify(n));
await selectOpening('Tür 2');
check('Migration: Tür an Westwand → Anschlag rechts', (await pressed('door-hinge')) === 'right');
await selectOpening('Fenster 1');
check('Migration: Fenster einflügelig', (await pressed('window-sashes')) === '1');
check('Migration: unverändert geöffnet gilt als gespeichert', (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');
await page.getByTestId('add-radiator').click(); await settle();
await page.keyboard.press('ControlOrMeta+s'); await settle(300);
const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:alt-v2')));
check('Nach Speichern: Version 5 mit Anschlag, Flügeln und Raumobjekt', migrated.version === 5 && migrated.plan.openings[0].hinge === 'left' && migrated.plan.openings[1].hinge === 'right' && migrated.plan.openings[2].sashes === 1 && migrated.plan.fixtures.length === 1, JSON.stringify(migrated.plan.openings));
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Altprojekt V1' }).getByTestId('project-open').click(); await settle(600);
await selectOpening('Tür 1');
check('Version 1 → 3 in einem Schritt (Tür Süd → Anschlag rechts)', (await pressed('door-hinge')) === 'right' && (await page.getByTestId('fixture-list-item').count()) === 0);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Defekte Details' }).getByTestId('project-open').click(); await settle(600);
const notice = await page.getByTestId('project-notice').textContent();
check('Defekte Details: Hinweise statt Absturz', notice.includes('übersprungen') && notice.includes('Standardwerte'), notice);
check('Defekte Details: gültiger Heizkörper begrenzt, unbekanntes Objekt übersprungen, ungültige Gruppe verworfen', (await page.getByTestId('fixture-list-item').count()) === 1);
await selectFixture('Heizkörper 1');
check('Defekte Details: Heizkörper-Abstand auf Wand begrenzt (4,00)', (await valueOf(fx, 'Abstand von links')) === 4);
await selectOpening('Tür 1');
check('Defekte Details: ungültiger Anschlag → Standard (Nord: links)', (await pressed('door-hinge')) === 'left');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
